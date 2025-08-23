use crate::{
    config::{ProgramConfig, ProgramConfigRepo},
    database::{CreateProblemParams, CreateSolutionParams, DatabaseRepo},
};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{Manager, Runtime, State};
use tauri_specta::Event;

pub mod database;
pub mod runner;

#[derive(Debug, Serialize, Deserialize, Event, Clone, Type)]
pub struct ProgramConfigUpdateEvent {
    new: ProgramConfig,
}

#[tauri::command]
#[specta::specta]
pub async fn get_prog_config(cfg: State<'_, ProgramConfigRepo>) -> Result<ProgramConfig, String> {
    let guard = cfg.read().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn set_prog_config<R: Runtime>(
    app: tauri::AppHandle<R>,
    cfg: State<'_, ProgramConfigRepo>,
    data: ProgramConfig,
) -> Result<(), String> {
    {
        let mut guard = cfg.write().map_err(|e| e.to_string())?;
        *guard = data.clone();
        let event = ProgramConfigUpdateEvent { new: data };
        event.emit(&app).map_err(|e| e.to_string())?;
    }
    cfg.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn exit_app<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Event, Clone, Type)]
pub struct QueryClientInvalidateEvent {
    pub query_key: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub enum ToastKind {
    Info,
    Error,
    Warning,
    Success,
}

#[derive(Debug, Serialize, Deserialize, Event, Clone, Type)]
pub struct ToastEvent {
    kind: ToastKind,
    message: String,
}

#[tauri::command]
#[specta::specta]
pub async fn get_default_create_solution_params(
    app: tauri::AppHandle,
    name: String,
) -> Result<CreateSolutionParams, String> {
    let repo = app.state::<DatabaseRepo>();
    let cfg = repo.config.read().map_err(|e| e.to_string())?;
    let default_language = cfg.default_language.clone().unwrap_or_else(|| {
        cfg.language
            .keys()
            .map(|x| x.to_string())
            .next()
            .unwrap_or("text".to_string())
    });
    let content = cfg
        .language
        .get(&default_language)
        .map(|x| x.initial_solution_content.clone())
        .flatten();
    let params = CreateSolutionParams {
        name,
        author: Some(whoami::realname()),
        language: default_language,
        content,
    };
    Ok(params)
}

#[tauri::command]
#[specta::specta]
pub async fn get_default_create_problem_params(
    app: tauri::AppHandle,
    name: String,
    description: Option<String>,
    url: Option<String>,
    statement: Option<String>,
) -> Result<CreateProblemParams, String> {
    let params = CreateProblemParams {
        name: name.clone(),
        description,
        url,
        statement,
        checker: Some("ncmp".to_string()),
        time_limit: 3000,
        memory_limit: 1024,
        initial_solution: Some(get_default_create_solution_params(app, name.clone()).await?),
    };

    Ok(params)
}
