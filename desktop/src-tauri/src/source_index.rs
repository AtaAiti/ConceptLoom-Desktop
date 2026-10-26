use rusqlite::{params, Connection};
use serde_json::{json, Value};
type Error = Box<dyn std::error::Error>;

pub fn index(connection: &Connection, source: &Value) -> Result<(), Error> {
    let id = source["id"].as_str().ok_or("Missing source ID")?;
    let workspace = source["workspaceId"].as_str().ok_or("Missing workspace")?;
    connection.execute("DELETE FROM source_chunks WHERE source_id=?1", [id])?;
    let mut position = 0;
    for page in source["pages"].as_array().ok_or("Missing source pages")? {
        let chars: Vec<char> = page["text"]
            .as_str()
            .ok_or("Missing source text")?
            .chars()
            .collect();
        let mut start = 0;
        while start < chars.len() {
            let mut end = (start + 1200).min(chars.len());
            if end < chars.len() {
                if let Some(offset) = chars[start + 600..end]
                    .iter()
                    .rposition(|c| *c == '\n' || *c == ' ')
                {
                    end = start + 600 + offset + 1;
                }
            }
            let text: String = chars[start..end].iter().collect();
            if !text.trim().is_empty() {
                connection.execute("INSERT INTO source_chunks(id,source_id,workspace_id,text,page,section,position) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![format!("{id}:{position}"),id,workspace,text.trim(),page["page"].as_i64(),page["section"].as_str(),position])?;
                position += 1;
            }
            start = end;
        }
    }
    Ok(())
}

pub fn search(
    connection: &Connection,
    workspace: &str,
    source_ids: &[String],
    query: &str,
) -> Result<Value, Error> {
    if source_ids.is_empty() {
        return Ok(json!([]));
    }
    // Quote tokens; never interpret a source/user query as FTS syntax.
    let terms: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .take(24)
        .map(|s| format!("\"{s}\""))
        .collect();
    if terms.is_empty() {
        return Ok(json!([]));
    }
    let mut statement = connection.prepare("SELECT c.id,c.source_id,c.text,c.page,c.section,c.position FROM source_fts JOIN source_chunks c ON c.rowid=source_fts.rowid WHERE source_fts MATCH ?1 AND c.workspace_id=?2 AND c.source_id IN (SELECT value FROM json_each(?3)) ORDER BY bm25(source_fts),c.id LIMIT 6")?;
    let rows = statement.query_map(params![terms.join(" OR "),workspace,serde_json::to_string(source_ids)?], |r| Ok(json!({"id":r.get::<_,String>(0)?,"sourceId":r.get::<_,String>(1)?,"workspaceId":workspace,"text":r.get::<_,String>(2)?,"page":r.get::<_,Option<i64>>(3)?,"section":r.get::<_,Option<String>>(4)?.unwrap_or_default(),"position":r.get::<_,i64>(5)?})))?;
    Ok(Value::Array(rows.collect::<Result<Vec<_>, _>>()?))
}
