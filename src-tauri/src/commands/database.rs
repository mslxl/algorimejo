use std::{collections::HashMap, path::PathBuf};

use crate::{
    commands::{QueryClientInvalidateEvent, ToastEvent, ToastKind},
    database::{
        competitive_companion::handle_competitive_companion_message,
        config::{AdvLanguageItem, WorkspaceConfig},
        CreateCheckerParams, CreateCheckerResult, CreateProblemParams, CreateProblemResult,
        CreateSolutionParams, CreateSolutionResult, DatabaseRepo, GetProblemsParams,
        GetProblemsResult,
    },
    document::DocumentRepo,
    model::{Problem, ProblemChangeset, Solution, SolutionChangeset, TestCase},
    runner::BUNDLED_CHECKER_NAME,
};
use log::{error, trace};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{path::BaseDirectory, Manager, Runtime, State};
use tauri_specta::Event;
use tokio::{
    io::{AsyncReadExt, BufReader},
    net::TcpListener,
    sync::Mutex,
};

#[tauri::command]
#[specta::specta]
pub async fn get_problems(
    params: GetProblemsParams,
    db: State<'_, DatabaseRepo>,
) -> Result<GetProblemsResult, String> {
    trace!("get_problems: {:?}", params);
    db.get_problems(params).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn create_problem(
    params: CreateProblemParams,
    db: State<'_, DatabaseRepo>,
    doc_repo: State<'_, DocumentRepo>,
) -> Result<CreateProblemResult, String> {
    trace!("create_problem: {:?}", params);
    let initial_code = params
        .initial_solution
        .as_ref()
        .map(|x| x.content.clone())
        .flatten();
    let res = db.create_problem(params).map_err(|e| e.to_string())?;

    if let Some(solution) = res.problem.solutions.first() {
        if let Some(initial_code) = initial_code {
            let doc = solution.document.as_ref().unwrap();
            let filepath = db
                .get_document_filepath(&doc.id)
                .map_err(|e| e.to_string())?;
            doc_repo
                .manage(doc.id.clone(), filepath)
                .map_err(|e| e.to_string())?;
            doc_repo
                .set_string_of_doc(&doc.id, "content", &initial_code)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(res)
}

#[tauri::command]
#[specta::specta]
pub async fn create_solution(
    problem_id: String,
    params: CreateSolutionParams,
    db: State<'_, DatabaseRepo>,
) -> Result<CreateSolutionResult, String> {
    db.create_solution(&problem_id, params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_solution(
    solution_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<Solution, String> {
    db.get_solution(&solution_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_problem(problem_id: String, db: State<'_, DatabaseRepo>) -> Result<(), String> {
    db.delete_problem(&problem_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn update_problem(
    problem_id: String,
    params: ProblemChangeset,
    db: State<'_, DatabaseRepo>,
) -> Result<(), String> {
    db.update_problem(&problem_id, params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn update_solution(
    solution_id: String,
    params: SolutionChangeset,
    db: State<'_, DatabaseRepo>,
) -> Result<(), String> {
    db.update_solution(&solution_id, params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_solution(
    solution_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<String, String> {
    db.delete_solution(&solution_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn create_checker(
    params: CreateCheckerParams,
    db: State<'_, DatabaseRepo>,
) -> Result<CreateCheckerResult, String> {
    db.create_checker(params).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_problem(
    problem_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<Problem, String> {
    db.get_problem(&problem_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn create_testcase(
    problem_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<TestCase, String> {
    trace!("create testcase for problem {:?}", problem_id);
    let nu = db.create_testcase(&problem_id).map_err(|e| e.to_string());
    trace!("testcase: {:?}", nu);
    nu
}

#[tauri::command]
#[specta::specta]
pub async fn delete_testcase(
    testcase_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<(), String> {
    trace!("delete testcase {:?}", testcase_id);
    db.delete_testcase(&testcase_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_testcases(
    problem_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<Vec<TestCase>, String> {
    trace!("get testcases of problem {:?}", problem_id);
    let cases = db.get_testcases(&problem_id).map_err(|e| e.to_string());
    trace!("testcases: {:?}", cases);
    cases
}

#[tauri::command]
#[specta::specta]
pub async fn load_document(
    db: State<'_, DatabaseRepo>,
    repo: State<'_, DocumentRepo>,
    doc_id: String,
) -> Result<Vec<u8>, String> {
    let filepath = db
        .get_document_filepath(&doc_id)
        .map_err(|e| e.to_string())?;
    log::trace!(
        "start to load document {} from {}",
        &doc_id,
        &filepath.to_string_lossy()
    );
    let snapshot = repo.manage(doc_id, filepath).map_err(|e| e.to_string())?;
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn get_string_of_doc(
    doc_id: String,
    name: String,
    db: State<'_, DatabaseRepo>,
    repo: State<'_, DocumentRepo>,
) -> Result<String, String> {
    if !repo.has(&doc_id) {
        trace!("document {} not found, loading it from database...", doc_id);
        load_document(db, repo.clone(), doc_id.clone()).await?;
    }
    let s = repo
        .get_string_of_doc(&doc_id, &name)
        .map_err(|e| e.to_string())?;
    trace!("get string of doc {}[{}]: {}", doc_id, name, s.len());
    Ok(s)
}

#[tauri::command]
#[specta::specta]
pub async fn apply_change(
    doc_id: String,
    change: Vec<u8>,
    repo: State<'_, DocumentRepo>,
) -> Result<(), String> {
    repo.apply_change(&doc_id, change)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize, Event, Clone, Type)]
pub struct WorkspaceConfigUpdateEvent {
    new: WorkspaceConfig,
}

#[tauri::command]
#[specta::specta]
pub async fn get_workspace_config(db: State<'_, DatabaseRepo>) -> Result<WorkspaceConfig, String> {
    let guard = db.config.read().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn set_workspace_config<R: Runtime>(
    app: tauri::AppHandle<R>,
    db: State<'_, DatabaseRepo>,
    data: WorkspaceConfig,
) -> Result<(), String> {
    {
        let mut guard = db.config.write().map_err(|e| e.to_string())?;
        *guard = data.clone();
    }
    db.save_config("config.toml").map_err(|e| e.to_string())?;
    let event = WorkspaceConfigUpdateEvent { new: data };
    event.emit(&app).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_languages(
    db: State<'_, DatabaseRepo>,
) -> Result<HashMap<String, AdvLanguageItem>, String> {
    db.get_languages().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn resolve_checker(app: tauri::AppHandle, name: String) -> Result<PathBuf, String> {
    if BUNDLED_CHECKER_NAME.contains(&name.as_str()) {
        let path = app
            .path()
            .resolve(
                format!(
                    "testlib/{}{}",
                    &name,
                    if cfg!(target_os = "windows") {
                        ".exe"
                    } else {
                        ""
                    }
                ),
                BaseDirectory::Resource,
            )
            .map_err(|e| format!("Failed to resolve checker {}, this may caused by incomplete resource, please check testlib folder or try to reinstall the app: {}", name, e.to_string()))?;
        trace!("resolved checker {} to {:?}", &name, &path);
        Ok(path)
    } else {
        //TODO: custom checker with testlib
        unimplemented!()
    }
}

#[derive(Default)]
pub struct CompetitiveCompanionListenerState {
    shutdown_tx: Mutex<Option<tokio::sync::mpsc::UnboundedSender<()>>>,
}

#[tauri::command]
#[specta::specta]
pub async fn launch_competitive_companion_listener(
    app: tauri::AppHandle,
    addr: String,
) -> Result<(), String> {
    let app_handle = app.clone();
    let state = app.state::<CompetitiveCompanionListenerState>();
    let mut guard = state.shutdown_tx.lock().await;
    if guard.is_some() {
        return Err("Competitive companion listener already running".to_string());
    }
    trace!("launching competitive companion listener on {}", addr);
    let listener = TcpListener::bind(addr).await.map_err(|e| e.to_string())?;
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<()>();
    *guard = Some(tx);

    tokio::spawn(async move {
        let mut shutdown_channel = rx;
        let listener = listener;
        loop {
            tokio::select! {
                _ = shutdown_channel.recv() => {
                    break;
                }
                Ok((mut stream, addr)) = listener.accept() => {
                    //TODO: handle errors
                    let mut reader = BufReader::new(&mut stream);
                    let mut content = String::new();
                    if let Err(err) = reader.read_to_string(&mut content).await {
                        error!("failed to read competitive companion message from {}: {}", addr, err);
                        ToastEvent{
                            kind: ToastKind::Error,
                            message: format!("failed to read competitive companion message from {}: {}", addr, err)
                        }.emit(&app_handle).unwrap();
                        continue;
                    }
                    // Skip http header
                    let content = content.lines()
                        .skip_while(|line| !line.is_empty())
                        .skip(1)
                        .collect::<Vec<_>>()
                        .join("\n");
                    trace!("competitive companion {} -> {}", addr, content);
                    if let Err(err) = handle_competitive_companion_message(app_handle.clone(), &content).await {
                        error!("failed to handle competitive companion message from {}: {:?}", addr, err);
                        ToastEvent{
                            kind: ToastKind::Error,
                            message: format!("failed to handle competitive companion message from {}: {}", addr, err)
                        }.emit(&app_handle).unwrap();
                    }
                    // invalidate query is here: src\hooks\use-problems-list.ts
                    let event = QueryClientInvalidateEvent { query_key: Some(vec!["problems".to_string()]) };
                    event.emit(&app_handle).unwrap();
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn shutdown_competitive_companion_listener(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<CompetitiveCompanionListenerState>();
    let mut guard = state.shutdown_tx.lock().await;
    if guard.is_none() {
        return Err("Competitive companion listener not running".to_string());
    }
    trace!("shutting down competitive companion listener");
    guard.take().unwrap().send(()).unwrap();
    Ok(())
}
