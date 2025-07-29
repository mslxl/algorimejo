use crate::database::{DatabaseRepo, GetProblemsParams, GetProblemsResult};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn get_problems(
    params: GetProblemsParams,
    db: State<'_, DatabaseRepo>,
) -> Result<GetProblemsResult, String> {
    db.get_problems(params).map_err(|e| e.to_string())
}
