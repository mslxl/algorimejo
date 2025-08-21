use std::{
    collections::HashMap,
    hash::{DefaultHasher, Hash, Hasher},
    path::PathBuf,
};

use log::trace;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{path::BaseDirectory, Manager};
use tauri_specta::Event;
use tokio::sync::RwLock;

use crate::runner::{
    cmd::parse_command_with_env,
    get_bundled_checker_names,
    lang_server::{IOMethod, LangServerProcess, LangServerWriter},
    run::{launch_program, launch_program_without_input, ProgramOutput, ProgramSimpleOutput},
    temp_dir,
};

pub static ENV_KEY_BUNDLED_LSP: &str = "BUNDLED_LSP";
pub fn get_default_env(app: &tauri::AppHandle) -> anyhow::Result<HashMap<String, String>> {
    let path_resolver = app.path();
    let mut env = HashMap::new();
    env.insert(
        ENV_KEY_BUNDLED_LSP.to_string(),
        path_resolver
            .resolve("lang-server", BaseDirectory::Resource)?
            .display()
            .to_string(),
    );
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
pub struct LanguageServerEvent {
    pid: ChildPID,
    response: LanguageServerResponse,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug)]
#[serde(tag = "type")]
pub enum LanguageServerResponse {
    Closed { exit_code: i32 },
    Message { msg: String },
}

#[tauri::command]
#[specta::specta]
pub async fn launch_language_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, LangServerState>,
    commands: String,
    io_method: IOMethod,
) -> Result<ChildPID, String> {
    let env = get_default_env(&app).map_err(|e| e.to_string())?;
    let cmd = parse_command_with_env(&commands, &env).map_err(|e| e.to_string())?;
    let process = LangServerProcess::launch(cmd, io_method).map_err(|e| e.to_string())?;
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
        let pid = pid.to_string();
        let handle = app;
        let state = handle.state::<LangServerState>();
        let reader = reader;
        while let Ok(message) = reader.receive_message().await {
            log::trace!("lsp <- {}: {}", &pid, &message);
            let response_body = LanguageServerEvent {
                pid: pid.to_string(),
                response: LanguageServerResponse::Message { msg: message },
            };
            response_body.emit(&handle).unwrap();
        }
        if !reader.is_alive().await {
            log::trace!("language server {} is dead", &pid);
            let response_body = LanguageServerEvent {
                pid: pid.to_string(),
                response: LanguageServerResponse::Closed {
                    exit_code: reader.exit_code().await.unwrap_or(0),
                },
            };
            response_body.emit(&handle).unwrap();

            log::trace!("recycling language server {} handler", &pid);
            let mut process_state = state.processes.write().await;
            process_state.remove(&pid);
            let mut writer_state = state.writers.write().await;
            writer_state.remove(&pid);
        }
    });

    Ok(pid.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn kill_language_server(
    state: tauri::State<'_, LangServerState>,
    pid: ChildPID,
) -> Result<(), String> {
    log::trace!("killing language server: {}", &pid);
    let process_state = state.processes.write().await;
    let process = process_state.get(&pid).ok_or("Process not found")?;

    process.kill().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn send_message_to_language_server(
    state: tauri::State<'_, LangServerState>,
    pid: ChildPID,
    message: String,
) -> Result<(), String> {
    log::trace!("lsp -> {}: {}", &pid, &message);
    let writer_state = state.writers.write().await;
    let writer = writer_state.get(&pid).ok_or("Writer not found")?;
    writer
        .send_message(&message)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum ProgramOutputSource {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type, Event)]
pub struct ProgramOutputEvent {
    task_tag: String,
    source: ProgramOutputSource,
    line: String,
}

#[tauri::command]
#[specta::specta]
pub async fn write_file_to_task_tag(
    task_tag: String,
    filename: String,
    content: String,
) -> Result<PathBuf, String> {
    let temp_dir = temp_dir(&task_tag);
    let file = temp_dir.join(filename);
    if !temp_dir.exists() {
        tokio::fs::create_dir_all(&temp_dir)
            .await
            .map_err(|e| e.to_string())?;
    }
    trace!(
        "write {} bytes to {:?} with task tag: {}",
        content.len(),
        &file,
        &task_tag
    );
    tokio::fs::write(&file, content)
        .await
        .map_err(|e| e.to_string())?;

    Ok(file)
}

#[tauri::command]
#[specta::specta]
pub async fn execute_program_callback(
    app: tauri::AppHandle,
    task_tag: String,
    commands: String,
    env: HashMap<String, String>,
    input_filename: PathBuf,
    timeout_millis: u32,
) -> Result<ProgramOutput, String> {
    let def_env = get_default_env(&app).map_err(|e| e.to_string())?;
    let mut env: HashMap<String, String> = env.into_iter().chain(def_env.into_iter()).collect();

    let temp_dir = temp_dir(&task_tag);
    env.insert("CWD".to_string(), temp_dir.display().to_string());
    let mut cmd = parse_command_with_env(&commands, &env).map_err(|e| e.to_string())?;
    cmd.current_dir(&temp_dir);

    let mut hasher = DefaultHasher::new();
    input_filename.hash(&mut hasher);
    let input_hash = hasher.finish();
    let output_file = temp_dir.join(format!("output-{:x}.txt", input_hash));

    let app1 = app.clone();
    let app2 = app.clone();
    let task_tag1 = task_tag;
    let task_tag2 = task_tag1.clone();
    log::trace!("launch program with callback: {:?}", &cmd);
    let output = launch_program(
        cmd,
        input_filename,
        output_file,
        timeout_millis as u128,
        move |e| {
            let event = ProgramOutputEvent {
                task_tag: task_tag1.clone(),
                source: ProgramOutputSource::Stdout,
                line: e.to_string(),
            };
            event.emit(&app1).unwrap();
        },
        move |e| {
            let event = ProgramOutputEvent {
                task_tag: task_tag2.clone(),
                source: ProgramOutputSource::Stderr,
                line: e.to_string(),
            };
            event.emit(&app2).unwrap();
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(output)
}

#[tauri::command]
#[specta::specta]
pub async fn execute_program(
    app: tauri::AppHandle,
    task_tag: String,
    commands: String,
    env: HashMap<String, String>,
    timeout_millis: u32,
) -> Result<ProgramSimpleOutput, String> {
    let def_env = get_default_env(&app).map_err(|e| e.to_string())?;
    let mut env: HashMap<String, String> = env.into_iter().chain(def_env.into_iter()).collect();

    let temp_dir = temp_dir(&task_tag);
    env.insert("CWD".to_string(), temp_dir.display().to_string());
    let mut cmd = parse_command_with_env(&commands, &env).map_err(|e| e.to_string())?;
    cmd.current_dir(&temp_dir);

    log::trace!("launch program: {:?}", &cmd);
    let output = launch_program_without_input(cmd, timeout_millis as u128)
        .await
        .map_err(|e| e.to_string())?;

    Ok(output)
}
