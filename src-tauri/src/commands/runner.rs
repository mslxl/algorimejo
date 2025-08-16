use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{path::BaseDirectory, Manager};
use tauri_specta::Event;
use tokio::sync::RwLock;

use crate::{runner::{cmd::parse_command_with_env, get_bundled_checker_names, lang_server::{IOMethod, LangServerProcess, LangServerWriter}}};


pub static ENV_KEY_BUNDLED_LSP: &str = "BUNDLED_LSP";
pub fn get_default_env(app: &tauri::AppHandle) -> anyhow::Result<HashMap<String, String>> {
  let path_resolver = app.path();
    let mut env = HashMap::new();
    env.insert(ENV_KEY_BUNDLED_LSP.to_string(), path_resolver.resolve("lang-server", BaseDirectory::Resource)?.display().to_string());
    Ok(env)
}

#[tauri::command]
#[specta::specta]
pub async fn get_checkers_name() -> Result<Vec<String>, String> {
    Ok(get_bundled_checker_names()
        .iter()
        .map(|s| s.to_string())
        .collect())
}

/// This type is used to identify a child process.
/// JavaScript can't handle u32, so we use a string.
type ChildPID = String;

#[derive(Default)]
pub struct LangServerState {
    pub writers: RwLock<HashMap<ChildPID, LangServerWriter>>,
    pub processes: RwLock<HashMap<ChildPID, LangServerProcess>>,
}

#[derive(Serialize, Deserialize, Type, Event, Clone, Debug)]
pub struct LanguageServerResponseEvent {
  pid: ChildPID,
  message: String
}

#[tauri::command]
#[specta::specta]
pub async fn launch_language_server(app: tauri::AppHandle, state: tauri::State<'_, LangServerState>, commands: String, io_method:IOMethod ) -> Result<ChildPID, String> {
  let env = get_default_env(&app).map_err(|e| e.to_string())?;
  let cmd = parse_command_with_env(&commands, &env).map_err(|e| e.to_string())?;
  let process = LangServerProcess::launch(tokio::process::Command::from(cmd), io_method).map_err(|e| e.to_string())?;
  let pid = process.pid().await.ok_or("Failed to get PID")?;
  let writer = process.create_writer();
  let reader = process.create_reader();

  {
    let mut process_state = state.processes.write().await;
    process_state.insert(pid.to_string(), process);
    let mut writer_state = state.writers.write().await;
    writer_state.insert(pid.to_string(), writer);
  }
  
  tokio::spawn(async move {
    let reader = reader;
    let handle = app;
    while let Ok(message) = reader.receive_message().await {
      log::trace!("lsp <- {}: {:?}", &pid, &message);
      let response_body = LanguageServerResponseEvent { pid: pid.to_string(), message };
      response_body.emit(&handle).unwrap();
    }
    if !reader.is_alive().await{
      log::trace!("language server {} is dead", &pid);
    }
  });

  Ok(pid.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn kill_language_server(state: tauri::State<'_, LangServerState>, pid: ChildPID) -> Result<(), String> {
  let mut process_state = state.processes.write().await;
  let process = process_state.remove(&pid).ok_or("Process not found")?;
  let mut writer_state = state.writers.write().await;
  let _ = writer_state.remove(&pid);

  log::trace!("killing language server: {}", &pid);
  process.kill().await.map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn send_message_to_language_server(state: tauri::State<'_, LangServerState>, pid: ChildPID, message: String) -> Result<(), String> {
  let writer_state = state.writers.write().await;
  let writer = writer_state.get(&pid).ok_or("Writer not found")?;
  log::trace!("lsp -> {}: {:?}", &pid, &message);
  writer.send_message(&message).await.map_err(|e| e.to_string())?;
  Ok(())
}