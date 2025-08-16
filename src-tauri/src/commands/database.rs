use std::collections::HashMap;

use crate::{
    database::{
        config::{AdvLanguageItem, WorkspaceConfig},
        CreateCheckerParams, CreateCheckerResult, CreateProblemParams, CreateProblemResult,
        CreateSolutionParams, CreateSolutionResult, DatabaseRepo, GetProblemsParams,
        GetProblemsResult,
    },
    document::DocumentRepo,
    model::{Problem, ProblemChangeset, Solution, SolutionChangeset, TestCase},
};
use log::trace;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{Runtime, State};
use tauri_specta::Event;

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
) -> Result<CreateProblemResult, String> {
    trace!("create_problem: {:?}", params);
    db.create_problem(params).map_err(|e| e.to_string())
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