
use crate::config::{ProgramConfig, ProgramConfigRepo};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{Runtime, State};
use tauri_specta::Event;

pub mod runner;
pub mod database;


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

