use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::Path;

const COLLECTIONS: &[(&str, &str)] = &[
    ("courses", "courses"),
    ("topics", "topics"),
    ("lessons", "lessons"),
    ("sessions", "learning_sessions"),
    ("attempts", "exercise_attempts"),
    ("cards", "flashcards"),
    ("reviews", "reviews"),
    ("messages", "ai_messages"),
    ("notes", "library_notes"),
];

pub fn open(path: &Path) -> Result<Connection, rusqlite::Error> {
    let mut connection = Connection::open(path)?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(include_str!("../migrations/001_initial.sql"))?;
    transaction.commit()?;
    Ok(connection)
}

pub fn load(connection: &Connection) -> Result<Option<Value>, Box<dyn std::error::Error>> {
    let settings: Option<String> = connection
        .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
        .optional()?;
    let Some(settings) = settings else {
        return Ok(None);
    };
    let mut state = json!({"version": 1, "settings": serde_json::from_str::<Value>(&settings)?});
    for (key, table) in COLLECTIONS {
        let mut statement =
            connection.prepare(&format!("SELECT payload FROM {table} ORDER BY rowid"))?;
        let rows = statement.query_map([], |r| r.get::<_, String>(0))?;
        let mut values = Vec::new();
        for row in rows {
            values.push(serde_json::from_str::<Value>(&row?)?);
        }
        state[*key] = Value::Array(values);
    }
    Ok(Some(state))
}

fn field<'a>(value: &'a Value, name: &str) -> Result<&'a str, Box<dyn std::error::Error>> {
    value
        .get(name)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Missing {name}").into())
}

pub fn save(connection: &mut Connection, state: &Value) -> Result<(), Box<dyn std::error::Error>> {
    if state["version"] != 1 || !state["settings"].is_object() {
        return Err("Invalid workspace version/settings".into());
    }
    let tx = connection.transaction()?;
    // One transaction enforces the original save-before-continue invariant.
    tx.execute("DELETE FROM courses", [])?;
    for (key, table) in COLLECTIONS {
        let items = state[*key]
            .as_array()
            .ok_or_else(|| format!("Missing collection {key}"))?;
        for item in items {
            let id = field(item, "id")?;
            let payload = serde_json::to_string(item)?;
            match *key {
                "courses" => {
                    tx.execute(
                        "INSERT INTO courses(id,payload) VALUES(?1,?2)",
                        params![id, payload],
                    )?;
                }
                "topics" | "messages" | "notes" => {
                    tx.execute(
                        &format!("INSERT INTO {table}(id,course_id,payload) VALUES(?1,?2,?3)"),
                        params![id, field(item, "courseId")?, payload],
                    )?;
                }
                "reviews" => {
                    tx.execute(
                        "INSERT INTO reviews(id,course_id,card_id,payload) VALUES(?1,?2,?3,?4)",
                        params![
                            id,
                            field(item, "courseId")?,
                            field(item, "cardId")?,
                            payload
                        ],
                    )?;
                }
                _ => {
                    tx.execute(&format!("INSERT INTO {table}(id,course_id,topic_id,payload) VALUES(?1,?2,?3,?4)"), params![id, field(item, "courseId")?, item["topicId"].as_str(), payload])?;
                }
            }
            if *key == "lessons" {
                for exercise in item["content"]["exercises"]
                    .as_array()
                    .ok_or("Missing exercises")?
                {
                    let exercise_id = format!("{}:{}", id, field(exercise, "id")?);
                    tx.execute(
                        "INSERT INTO exercises(id,lesson_id,payload) VALUES(?1,?2,?3)",
                        params![exercise_id, id, serde_json::to_string(exercise)?],
                    )?;
                }
            }
            if *key == "attempts" && item["accurate"] == false {
                tx.execute("INSERT INTO mistakes(attempt_id,course_id,topic_id,payload) VALUES(?1,?2,?3,?4)", params![id, field(item, "courseId")?, field(item, "topicId")?, payload])?;
            }
        }
    }
    for topic in state["topics"].as_array().ok_or("Missing topics")? {
        for dependency in topic["dependsOn"]
            .as_array()
            .ok_or("Missing dependencies")?
        {
            let prerequisite = dependency.as_str().ok_or("Invalid dependency")?;
            let same_course: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM topics WHERE id=?1 AND course_id=?2)",
                params![prerequisite, field(topic, "courseId")?],
                |r| r.get(0),
            )?;
            if !same_course {
                return Err("Prerequisites must belong to the same course".into());
            }
            tx.execute(
                "INSERT INTO topic_dependencies(topic_id,prerequisite_id) VALUES(?1,?2)",
                params![field(topic, "id")?, prerequisite],
            )?;
        }
    }
    tx.execute("INSERT INTO settings(id,payload) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [serde_json::to_string(&state["settings"])?])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_failed_save_rolls_back() {
        let mut db = open(Path::new(":memory:")).unwrap();
        let mut state = json!({"version":1,"settings":{},"courses":[{"id":"c"}],"topics":[],"lessons":[],"sessions":[],"attempts":[],"cards":[],"reviews":[],"messages":[],"notes":[]});
        save(&mut db, &state).unwrap();
        assert_eq!(load(&db).unwrap().unwrap(), state);
        state["topics"] = json!([{"id":"t","courseId":"missing","dependsOn":[]}]);
        assert!(save(&mut db, &state).is_err());
        assert_eq!(load(&db).unwrap().unwrap()["courses"][0]["id"], "c");
        assert!(load(&db).unwrap().unwrap()["topics"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn saves_learning_evidence_cards_and_resume_point_together() {
        let mut db = open(Path::new(":memory:")).unwrap();
        let state = json!({"version":1,"settings":{"model":"qwen3:4b"},
            "courses":[{"id":"c"}],
            "topics":[{"id":"t","courseId":"c","dependsOn":[]}],
            "lessons":[{"id":"l","courseId":"c","topicId":"t","content":{"exercises":[{"id":"e"}]}}],
            "sessions":[{"id":"t","courseId":"c","topicId":"t","nextStep":"Repair the connection"}],
            "attempts":[{"id":"a","courseId":"c","topicId":"t","accurate":false}],
            "cards":[{"id":"f","courseId":"c","topicId":"t"}],
            "reviews":[{"id":"r","courseId":"c","cardId":"f","topicId":"t"}],
            "messages":[],"notes":[]});
        save(&mut db, &state).unwrap();
        assert_eq!(load(&db).unwrap().unwrap(), state);
        assert_eq!(
            db.query_row("SELECT count(*) FROM mistakes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            db.query_row("SELECT count(*) FROM exercises", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
