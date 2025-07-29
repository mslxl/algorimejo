use crate::{
    database::{
        CreateCheckerParams, CreateCheckerResult, CreateProblemParams, CreateProblemResult,
        CreateSolutionParams, CreateSolutionResult, DatabaseRepo, GetProblemsParams,
        GetProblemsResult,
    },
    model::{ProblemChangeset, SolutionChangeset},
};
use log::trace;
use tauri::State;

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
