mod accounts;
mod changes;
mod database;
mod source_index;
use serde_json::Value;
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tauri::{Manager, State};

struct Storage {
    connection: Mutex<Result<rusqlite::Connection, String>>,
    path: PathBuf,
}
fn db_error(error: impl std::fmt::Display) -> String {
    eprintln!("ConceptLoom database: {error}");
    "Your data could not be read or saved. Check available disk space and restart the app. No progress was advanced.".into()
}
#[tauri::command]
async fn load_workspace(storage: State<'_, Storage>) -> Result<Option<Value>, String> {
    let db = storage.connection.lock().map_err(db_error)?;
    let db = db.as_ref().map_err(Clone::clone)?;
    database::load(db).map_err(db_error)
}
#[tauri::command]
async fn apply_changes(storage: State<'_, Storage>, patch: Value) -> Result<(), String> {
    let mut db = storage.connection.lock().map_err(db_error)?;
    let db = db.as_mut().map_err(|error| error.clone())?;
    changes::apply(db, &patch).map_err(db_error)
}
#[tauri::command]
async fn search_sources(
    storage: State<'_, Storage>,
    workspace_id: String,
    source_ids: Vec<String>,
    query: String,
) -> Result<Value, String> {
    let db = storage.connection.lock().map_err(db_error)?;
    source_index::search(
        db.as_ref().map_err(Clone::clone)?,
        &workspace_id,
        &source_ids,
        &query,
    )
    .map_err(db_error)
}
#[tauri::command]
fn data_location(storage: State<Storage>) -> String {
    storage.path.to_string_lossy().into_owned()
}

#[tauri::command]
async fn account_status(
    storage: State<'_, Storage>,
    provider: accounts::Provider,
) -> Result<accounts::AccountStatus, String> {
    accounts::status(
        storage.path.parent().ok_or("Папка приложения недоступна")?,
        provider,
    )
    .await
}
#[tauri::command]
async fn account_setup(
    storage: State<'_, Storage>,
    provider: accounts::Provider,
    action: String,
) -> Result<String, String> {
    accounts::setup(
        storage.path.parent().ok_or("Папка приложения недоступна")?,
        provider,
        &action,
    )
    .await
}
#[tauri::command]
async fn account_test(
    storage: State<'_, Storage>,
    provider: accounts::Provider,
    model: String,
) -> Result<String, String> {
    accounts::test(
        storage.path.parent().ok_or("Папка приложения недоступна")?,
        provider,
        &model,
    )
    .await
}
#[tauri::command]
async fn account_generate(
    storage: State<'_, Storage>,
    provider: accounts::Provider,
    model: String,
    messages: Vec<accounts::Message>,
    schema: Option<Value>,
    json_mode: bool,
) -> Result<String, String> {
    {
        let connection = storage.connection.lock().map_err(db_error)?;
        let db = connection.as_ref().map_err(Clone::clone)?;
        let payload: String = db
            .query_row("SELECT payload FROM settings WHERE id=1", [], |r| r.get(0))
            .map_err(db_error)?;
        let settings: Value = serde_json::from_str(&payload).map_err(db_error)?;
        accounts::authorize(&settings, provider, &model)?;
    }
    accounts::generate(
        storage.path.parent().ok_or("Папка приложения недоступна")?,
        provider,
        &model,
        messages,
        schema,
        json_mode,
    )
    .await
}

fn validate_endpoint(endpoint: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "Invalid local Ollama URL")?;
    if url.scheme() != "http"
        || !matches!(
            url.host_str(),
            Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
        )
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("Ollama must use an HTTP loopback URL.".into());
    }
    Ok(url)
}
#[tauri::command]
async fn ollama_request(
    endpoint: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = validate_endpoint(&endpoint)?;
    if !matches!(path.as_str(), "/api/tags" | "/api/chat") {
        return Err("Unsupported local AI operation".into());
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(if body.is_some() { 600 } else { 8 }))
        .build()
        .map_err(|e| {
            eprintln!("HTTP client: {e}");
            "Local AI unavailable".to_string()
        })?;
    let url = url.join(&path).map_err(|_| "Invalid local endpoint")?;
    let request = if let Some(body) = body {
        client.post(url).json(&body)
    } else {
        client.get(url)
    };
    let response = request.send().await.map_err(|e| {
        eprintln!("Ollama: {e}");
        if e.is_timeout() {
            "Local AI timed out".to_string()
        } else {
            "Local AI unavailable".to_string()
        }
    })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Model unavailable".into());
    }
    if !response.status().is_success() {
        return Err("Local AI request failed".into());
    }
    response.json().await.map_err(|e| {
        eprintln!("Ollama JSON: {e}");
        "Invalid local AI response".into()
    })
}
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let path = directory.join("conceptloom.sqlite3");
            let connection = std::fs::create_dir_all(&directory)
                .map_err(db_error)
                .and_then(|_| database::open(&path).map_err(db_error));
            app.manage(Storage {
                connection: Mutex::new(connection),
                path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            apply_changes,
            search_sources,
            data_location,
            ollama_request,
            account_status,
            account_setup,
            account_test,
            account_generate
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start ConceptLoom");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_local_ai_endpoints() {
        assert!(validate_endpoint("http://127.0.0.1:11434").is_ok());
        assert!(validate_endpoint("https://example.com").is_err());
        assert!(validate_endpoint("http://localhost.evil.com").is_err());
        assert!(validate_endpoint("http://user@localhost:11434").is_err());
    }
}
