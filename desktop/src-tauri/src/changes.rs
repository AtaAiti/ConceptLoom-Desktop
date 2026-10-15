use crate::source_index;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
type Error = Box<dyn std::error::Error>;
const TABLES: &[(&str, &str)] = &[
    ("workspaces", "workspaces"),
    ("libraries", "libraries"),
    ("courses", "courses"),
    ("topics", "topics"),
    ("lessons", "lessons"),
    ("sessions", "learning_sessions"),
    ("attempts", "exercise_attempts"),
    ("cards", "flashcards"),
    ("reviews", "reviews"),
    ("messages", "ai_messages"),
    ("notes", "library_notes"),
    ("sources", "sources"),
];
fn field<'a>(v: &'a Value, key: &str) -> Result<&'a str, Error> {
    v[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Missing {key}").into())
}

pub fn apply(connection: &mut Connection, patch: &Value) -> Result<(), Error> {
    if patch["version"] != 2 {
        return Err("Unsupported patch version".into());
    }
    let tx = connection.transaction()?;
    tx.execute_batch("PRAGMA defer_foreign_keys=ON;")?;
    for (key, table) in TABLES.iter().rev() {
        for id in patch["deletes"][key].as_array().ok_or("Invalid deletes")? {
            tx.execute(
                &format!("DELETE FROM {table} WHERE id=?1"),
                [id.as_str().ok_or("Invalid ID")?],
            )?;
        }
    }
    for (key, table) in TABLES {
        for item in patch["upserts"][key].as_array().ok_or("Invalid upserts")? {
            let id = field(item, "id")?;
            let payload = serde_json::to_string(item)?;
            match *key {
                "workspaces" => {
                    tx.execute("INSERT INTO workspaces(id,payload) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",params![id,payload])?;
                }
                "courses" | "libraries" | "sources" => {
                    let old: Option<String> = tx
                        .query_row(
                            &format!("SELECT payload FROM {table} WHERE id=?1"),
                            [id],
                            |r| r.get(0),
                        )
                        .optional()?;
                    tx.execute(&format!("INSERT INTO {table}(id,workspace_id,payload) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET workspace_id=excluded.workspace_id,payload=excluded.payload"),params![id,field(item,"workspaceId")?,payload])?;
                    if *key == "sources" {
                        for (relation, column, property) in [
                            ("source_libraries", "library_id", "libraryIds"),
                            ("source_courses", "course_id", "courseIds"),
                        ] {
                            tx.execute(
                                &format!("DELETE FROM {relation} WHERE source_id=?1"),
                                [id],
                            )?;
                            for member in item[property]
                                .as_array()
                                .ok_or("Missing source memberships")?
                            {
                                tx.execute(&format!("INSERT INTO {relation}(source_id,{column},workspace_id) VALUES(?1,?2,?3)"),params![id,member.as_str().ok_or("Invalid membership")?,field(item,"workspaceId")?])?;
                            }
                        }
                        let previous =
                            old.map(|v| serde_json::from_str::<Value>(&v)).transpose()?;
                        if previous.as_ref().map(|v| &v["pages"]) != Some(&item["pages"]) {
                            source_index::index(&tx, item)?;
                        }
                    }
                }
                "topics" | "messages" | "notes" => {
                    tx.execute(&format!("INSERT INTO {table}(id,course_id,payload) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,payload=excluded.payload"),params![id,field(item,"courseId")?,payload])?;
                }
                "reviews" => {
                    tx.execute("INSERT INTO reviews(id,course_id,card_id,payload) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,card_id=excluded.card_id,payload=excluded.payload",params![id,field(item,"courseId")?,field(item,"cardId")?,payload])?;
                }
                _ => {
                    tx.execute(&format!("INSERT INTO {table}(id,course_id,topic_id,payload) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,topic_id=excluded.topic_id,payload=excluded.payload"),params![id,field(item,"courseId")?,item["topicId"].as_str(),payload])?;
                }
            }
            if *key == "lessons" {
                tx.execute("DELETE FROM exercises WHERE lesson_id=?1", [id])?;
                for exercise in item["content"]["exercises"]
                    .as_array()
                    .ok_or("Missing exercises")?
                {
                    tx.execute(
                        "INSERT INTO exercises(id,lesson_id,payload) VALUES(?1,?2,?3)",
                        params![
                            format!("{id}:{}", field(exercise, "id")?),
                            id,
                            serde_json::to_string(exercise)?
                        ],
                    )?;
                }
            }
            if *key == "attempts" {
                tx.execute("DELETE FROM mistakes WHERE attempt_id=?1", [id])?;
                if item["accurate"] == false {
                    tx.execute("INSERT INTO mistakes(attempt_id,course_id,topic_id,payload) VALUES(?1,?2,?3,?4)",params![id,field(item,"courseId")?,field(item,"topicId")?,payload])?;
                }
            }
        }
    }
    for topic in patch["upserts"]["topics"]
        .as_array()
        .ok_or("Missing topics")?
    {
        let id = field(topic, "id")?;
        tx.execute("DELETE FROM topic_dependencies WHERE topic_id=?1", [id])?;
        for dep in topic["dependsOn"]
            .as_array()
            .ok_or("Missing dependencies")?
        {
            let dep = dep.as_str().ok_or("Invalid prerequisite")?;
            let matches: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM topics WHERE id=?1 AND course_id=?2)",
                params![dep, field(topic, "courseId")?],
                |r| r.get(0),
            )?;
            if !matches {
                return Err("Prerequisite crosses course boundary".into());
            }
            tx.execute(
                "INSERT INTO topic_dependencies VALUES(?1,?2)",
                params![id, dep],
            )?;
        }
    }
    if !patch["settings"].is_null() {
        if !patch["settings"].is_object() {
            return Err("Invalid settings".into());
        }
        tx.execute("INSERT INTO settings(id,payload) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",[serde_json::to_string(&patch["settings"])?])?;
    }
    let active = field(patch, "activeWorkspaceId")?;
    let valid: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=?1 AND json_extract(payload,'$.archived')=0)",[active],|r|r.get(0))?;
    if !valid {
        return Err("No active workspace".into());
    }
    tx.execute(
        "UPDATE app_metadata SET active_workspace_id=?1 WHERE id=1",
        [active],
    )?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn patch() -> Value {
        let mut p = json!({"version":2,"activeWorkspaceId":"my-learning","settings":{},"upserts":{},"deletes":{}});
        for (key, _) in TABLES {
            p["upserts"][key] = json!([]);
            p["deletes"][key] = json!([]);
        }
        p
    }
    #[test]
    fn targeted_writes_preserve_other_rowids_and_atomicity() {
        let mut db = crate::database::open(std::path::Path::new(":memory:")).unwrap();
        let mut p = patch();
        p["upserts"]["courses"] = json!([{"id":"c","workspaceId":"my-learning"}]);
        p["upserts"]["cards"] = json!([{"id":"f","courseId":"c","topicId":null,"front":"old"}]);
        apply(&mut db, &p).unwrap();
        db.execute_batch("CREATE TABLE audit(value TEXT); CREATE TRIGGER course_writes AFTER UPDATE ON courses BEGIN INSERT INTO audit VALUES('course updated'); END;").unwrap();
        let before: i64 = db
            .query_row("SELECT rowid FROM courses WHERE id='c'", [], |r| r.get(0))
            .unwrap();
        let mut update = patch();
        update["upserts"]["cards"] =
            json!([{"id":"f","courseId":"c","topicId":null,"front":"new"}]);
        apply(&mut db, &update).unwrap();
        let after: i64 = db
            .query_row("SELECT rowid FROM courses WHERE id='c'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(before, after);
        assert_eq!(
            db.query_row("SELECT count(*) FROM audit", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        update["upserts"]["cards"][0]["courseId"] = json!("missing");
        assert!(apply(&mut db, &update).is_err());
        assert_eq!(
            crate::database::load(&db).unwrap().unwrap()["cards"][0]["front"],
            "new"
        );
    }
    #[test]
    fn index_is_workspace_scoped_page_aware_and_removed_transactionally() {
        let mut db = crate::database::open(std::path::Path::new(":memory:")).unwrap();
        let mut p = patch();
        p["upserts"]["workspaces"] = json!([{"id":"other","archived":false}]);
        p["upserts"]["libraries"] = json!([{"id":"lib","workspaceId":"my-learning"},{"id":"private-lib","workspaceId":"other"}]);
        p["upserts"]["sources"] = json!([
            {"id":"s","workspaceId":"my-learning","libraryIds":["lib"],"courseIds":[],"pages":[{"page":18,"text":"Bplus trees store values in leaves"}]},
            {"id":"private","workspaceId":"other","libraryIds":["private-lib"],"courseIds":[],"pages":[{"page":2,"text":"Secret Bplus values"}]}
        ]);
        apply(&mut db, &p).unwrap();
        let result = source_index::search(
            &db,
            "my-learning",
            &["s".into(), "private".into()],
            "Bplus OR *",
        )
        .unwrap();
        assert_eq!(result.as_array().unwrap().len(), 1);
        assert_eq!(result[0]["page"], 18);
        let mut bad = patch();
        bad["upserts"]["sources"] = json!([{ "id":"leak","workspaceId":"my-learning","libraryIds":["private-lib"],"courseIds":[],"pages":[{"page":1,"text":"Must roll back"}]}]);
        assert!(apply(&mut db, &bad).is_err());
        assert_eq!(
            db.query_row("SELECT count(*) FROM sources", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        let mut deletion = patch();
        deletion["deletes"]["sources"] = json!(["s"]);
        apply(&mut db, &deletion).unwrap();
        assert!(
            source_index::search(&db, "my-learning", &["s".into()], "Bplus")
                .unwrap()
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
}
