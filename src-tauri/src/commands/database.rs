use std::{collections::HashMap, time::Duration};

use crate::{
    commands::{QueryClientInvalidateEvent, ToastEvent, ToastKind},
    database::{
        competitive_companion::handle_competitive_companion_message,
        config::{AdvLanguageItem, WorkspaceConfig},
        language::LanguageBase,
        CheckerUsage, CreateCheckerParams, CreateCheckerResult, CreateProblemParams,
        CreateProblemResult, CreateSolutionParams, CreateSolutionResult, DatabaseRepo,
        GetProblemsParams, GetProblemsResult, UpdateCheckerParams, UpsertCheckerSelfTestParams,
    },
    document::DocumentRepo,
    model::{
        Checker, CheckerSelfTest, Problem, ProblemChangeset, Solution, SolutionChangeset, TestCase,
    },
    runner::checker_sdk::sdk_info,
};
use log::{error, trace, warn};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, Runtime, State, Url};
use tauri_specta::Event;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
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
pub async fn delete_problem(
    app: AppHandle,
    problem_id: String,
    db: State<'_, DatabaseRepo>,
    doc_repo: State<'_, DocumentRepo>,
) -> Result<(), String> {
    let checker_ids = db
        .get_visible_checkers(Some(&problem_id))
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|checker| checker.owner_problem_id.as_deref() == Some(&problem_id))
        .map(|checker| checker.id)
        .collect::<Vec<_>>();
    let documents = db.delete_problem(&problem_id).map_err(|e| e.to_string())?;
    for document in documents {
        doc_repo.unmanage(&document.id);
    }
    for checker_id in checker_ids {
        if let Err(error) = super::checker::remove_checker_cache(&app, &db, &checker_id).await {
            warn!("Failed to remove cache for Checker {checker_id}: {error}");
        }
    }
    Ok(())
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
    doc_repo: State<'_, DocumentRepo>,
) -> Result<CreateCheckerResult, String> {
    let language = db
        .get_language_item(&params.language)
        .map_err(|error| error.to_string())?;
    sdk_info(language.base).map_err(|error| error.to_string())?;
    let content = params.content.clone().unwrap_or_default();
    let result = db.create_checker(params).map_err(|e| e.to_string())?;
    let document = result
        .checker
        .document
        .as_ref()
        .ok_or_else(|| "Custom checker has no source document".to_string())?;
    let initialization = db
        .get_document_filepath(&document.id)
        .and_then(|filepath| doc_repo.manage(document.id.clone(), filepath).map(|_| ()))
        .and_then(|_| doc_repo.set_string_of_doc(&document.id, "content", &content));
    if let Err(error) = initialization {
        doc_repo.unmanage(&document.id);
        if let Err(rollback_error) = db.delete_checker(&result.checker.id) {
            return Err(format!(
                "Failed to initialize Checker source: {error}; rollback failed: {rollback_error}"
            ));
        }
        return Err(format!("Failed to initialize Checker source: {error}"));
    }
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn get_checker(
    checker_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<Checker, String> {
    db.get_checker(&checker_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_visible_checkers(
    problem_id: Option<String>,
    db: State<'_, DatabaseRepo>,
) -> Result<Vec<Checker>, String> {
    db.get_visible_checkers(problem_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn update_checker(
    checker_id: String,
    params: UpdateCheckerParams,
    db: State<'_, DatabaseRepo>,
) -> Result<Checker, String> {
    let language = db
        .get_language_item(&params.language)
        .map_err(|error| error.to_string())?;
    sdk_info(language.base).map_err(|error| error.to_string())?;
    db.update_checker(&checker_id, params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_checker(
    app: AppHandle,
    checker_id: String,
    db: State<'_, DatabaseRepo>,
    doc_repo: State<'_, DocumentRepo>,
) -> Result<(), String> {
    let document_id = db
        .get_checker(&checker_id)
        .ok()
        .and_then(|checker| checker.document.map(|document| document.id));
    db.delete_checker(&checker_id).map_err(|e| e.to_string())?;
    if let Some(document_id) = document_id {
        doc_repo.unmanage(&document_id);
    }
    if let Err(error) = super::checker::remove_checker_cache(&app, &db, &checker_id).await {
        warn!("Failed to remove cache for Checker {checker_id}: {error}");
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_checker_usages(
    checker_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<Vec<CheckerUsage>, String> {
    db.get_checker_usages(&checker_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_problem_checker(
    problem_id: String,
    checker_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<(), String> {
    db.set_problem_checker(&problem_id, &checker_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_checker_self_tests(
    checker_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<Vec<CheckerSelfTest>, String> {
    db.get_checker_self_tests(&checker_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn upsert_checker_self_test(
    params: UpsertCheckerSelfTestParams,
    db: State<'_, DatabaseRepo>,
) -> Result<CheckerSelfTest, String> {
    db.upsert_checker_self_test(params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_checker_self_test(
    self_test_id: String,
    db: State<'_, DatabaseRepo>,
) -> Result<(), String> {
    db.delete_checker_self_test(&self_test_id)
        .map_err(|e| e.to_string())
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

#[derive(Default)]
pub struct CompetitiveCompanionListenerState {
    listener: Mutex<Option<CompetitiveCompanionListener>>,
}

struct CompetitiveCompanionListener {
    shutdown_tx: tokio::sync::mpsc::UnboundedSender<()>,
    task: tokio::task::JoinHandle<()>,
}

const COMPETITIVE_COMPANION_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const COMPETITIVE_COMPANION_MAX_HEADER_BYTES: usize = 16 * 1024;
const COMPETITIVE_COMPANION_MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
enum CompetitiveCompanionHttpRequest {
    Incomplete,
    Preflight,
    Message(String),
}

fn parse_competitive_companion_http_request(
    buffer: &[u8],
) -> Result<CompetitiveCompanionHttpRequest, String> {
    let mut headers = [httparse::EMPTY_HEADER; 32];
    let mut request = httparse::Request::new(&mut headers);
    let header_length = match request.parse(buffer).map_err(|error| error.to_string())? {
        httparse::Status::Partial => {
            if buffer.len() > COMPETITIVE_COMPANION_MAX_HEADER_BYTES {
                return Err("Competitive Companion HTTP headers are too large".to_string());
            }
            return Ok(CompetitiveCompanionHttpRequest::Incomplete);
        }
        httparse::Status::Complete(length) => length,
    };
    if header_length > COMPETITIVE_COMPANION_MAX_HEADER_BYTES {
        return Err("Competitive Companion HTTP headers are too large".to_string());
    }

    let method = request.method.unwrap_or_default();
    if method.eq_ignore_ascii_case("OPTIONS") {
        return Ok(CompetitiveCompanionHttpRequest::Preflight);
    }
    if !method.eq_ignore_ascii_case("POST") {
        return Err(format!(
            "Unsupported Competitive Companion HTTP method: {method}"
        ));
    }

    if request.headers.iter().any(|header| {
        header.name.eq_ignore_ascii_case("transfer-encoding")
            && !header.value.eq_ignore_ascii_case(b"identity")
    }) {
        return Err("Chunked Competitive Companion requests are not supported".to_string());
    }

    let content_length = request
        .headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case("content-length"))
        .ok_or_else(|| "Competitive Companion request is missing Content-Length".to_string())?
        .value;
    let content_length = std::str::from_utf8(content_length)
        .map_err(|_| "Competitive Companion Content-Length is not valid UTF-8".to_string())?
        .trim()
        .parse::<usize>()
        .map_err(|_| "Competitive Companion Content-Length is invalid".to_string())?;
    if content_length > COMPETITIVE_COMPANION_MAX_BODY_BYTES {
        return Err("Competitive Companion request body is too large".to_string());
    }

    let request_length = header_length
        .checked_add(content_length)
        .ok_or_else(|| "Competitive Companion request length overflowed".to_string())?;
    if buffer.len() < request_length {
        return Ok(CompetitiveCompanionHttpRequest::Incomplete);
    }

    let message = String::from_utf8(buffer[header_length..request_length].to_vec())
        .map_err(|_| "Competitive Companion request body is not valid UTF-8".to_string())?;
    Ok(CompetitiveCompanionHttpRequest::Message(message))
}

async fn read_competitive_companion_http_request(
    stream: &mut TcpStream,
) -> Result<CompetitiveCompanionHttpRequest, String> {
    tokio::time::timeout(COMPETITIVE_COMPANION_REQUEST_TIMEOUT, async {
        let mut buffer = Vec::new();
        let mut chunk = [0_u8; 8192];
        loop {
            match parse_competitive_companion_http_request(&buffer)? {
                CompetitiveCompanionHttpRequest::Incomplete => {}
                request => return Ok(request),
            }

            let read = stream.read(&mut chunk).await.map_err(|error| {
                format!("Failed to read Competitive Companion request: {error}")
            })?;
            if read == 0 {
                return Err(
                    "Competitive Companion connection closed before the request was complete"
                        .to_string(),
                );
            }
            buffer.extend_from_slice(&chunk[..read]);
        }
    })
    .await
    .map_err(|_| {
        format!(
            "Competitive Companion request timed out after {} seconds",
            COMPETITIVE_COMPANION_REQUEST_TIMEOUT.as_secs()
        )
    })?
}

async fn write_competitive_companion_http_response(
    stream: &mut TcpStream,
    status: u16,
    body: &str,
) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        _ => "Internal Server Error",
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nContent-Type: text/plain; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|error| format!("Failed to write Competitive Companion response: {error}"))?;
    stream
        .shutdown()
        .await
        .map_err(|error| format!("Failed to close Competitive Companion response: {error}"))
}

fn emit_competitive_companion_error(app: &tauri::AppHandle, message: String) {
    error!("{message}");
    if let Err(emit_error) = (ToastEvent {
        kind: ToastKind::Error,
        message,
    })
    .emit(app)
    {
        error!("failed to emit Competitive Companion error toast: {emit_error}");
    }
}

async fn handle_competitive_companion_connection(
    app: tauri::AppHandle,
    mut stream: TcpStream,
    addr: std::net::SocketAddr,
) {
    let request = match read_competitive_companion_http_request(&mut stream).await {
        Ok(request) => request,
        Err(error) => {
            emit_competitive_companion_error(
                &app,
                format!("failed to read Competitive Companion message from {addr}: {error}"),
            );
            let _ = write_competitive_companion_http_response(&mut stream, 400, &error).await;
            return;
        }
    };

    let CompetitiveCompanionHttpRequest::Message(content) = request else {
        if let Err(error) = write_competitive_companion_http_response(&mut stream, 204, "").await {
            error!("failed to respond to Competitive Companion preflight from {addr}: {error}");
        }
        return;
    };

    trace!("competitive companion {} -> {}", addr, content);
    if let Err(error) = handle_competitive_companion_message(app.clone(), &content).await {
        let message =
            format!("failed to handle Competitive Companion message from {addr}: {error}");
        emit_competitive_companion_error(&app, message.clone());
        let _ = write_competitive_companion_http_response(&mut stream, 400, &message).await;
        return;
    }

    let event = QueryClientInvalidateEvent {
        query_key: Some(vec!["problems".to_string()]),
    };
    if let Err(error) = event.emit(&app) {
        error!("failed to invalidate problems after Competitive Companion import: {error}");
    }
    if let Err(error) = write_competitive_companion_http_response(&mut stream, 200, "OK").await {
        error!("failed to respond to Competitive Companion request from {addr}: {error}");
    }
}

#[tauri::command]
#[specta::specta]
pub async fn launch_competitive_companion_listener(
    app: tauri::AppHandle,
    addr: String,
) -> Result<(), String> {
    let app_handle = app.clone();
    let state = app.state::<CompetitiveCompanionListenerState>();
    let mut guard = state.listener.lock().await;
    if guard.is_some() {
        return Err("Competitive companion listener already running".to_string());
    }
    trace!("launching competitive companion listener on {}", addr);
    let listener = TcpListener::bind(addr).await.map_err(|e| e.to_string())?;
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<()>();
    let task = tokio::spawn(async move {
        let mut shutdown_channel = rx;
        loop {
            tokio::select! {
                _ = shutdown_channel.recv() => {
                    break;
                }
                accepted = listener.accept() => {
                    match accepted {
                        Ok((stream, addr)) => {
                            tokio::spawn(handle_competitive_companion_connection(app_handle.clone(), stream, addr));
                        }
                        Err(error) => {
                            error!("failed to accept Competitive Companion connection: {error}");
                            tokio::time::sleep(Duration::from_millis(100)).await;
                        }
                    }
                }
            }
        }
    });
    *guard = Some(CompetitiveCompanionListener {
        shutdown_tx: tx,
        task,
    });

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn shutdown_competitive_companion_listener(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<CompetitiveCompanionListenerState>();
    let mut guard = state.listener.lock().await;
    trace!("shutting down competitive companion listener");
    let listener = guard.take();
    drop(guard);
    if let Some(listener) = listener {
        let _ = listener.shutdown_tx.send(());
        listener
            .task
            .await
            .map_err(|error| format!("Competitive Companion listener task failed: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn save_duplicated_file(
    repo: State<'_, DocumentRepo>,
    db: State<'_, DatabaseRepo>,
    problem: Problem,
    solution: Solution,
    content: Option<String>,
) -> Result<(), String> {
    let cfg = {
        let cfg_guard = db.config.read().map_err(|e| e.to_string())?;
        if !cfg_guard.duplicate_save {
            return Err("Duplicated save is disabled".to_string());
        }
        cfg_guard.clone()
    };
    if solution.document.is_none() {
        return Err("Solution has no document".to_string());
    }
    if let Some(location) = &cfg.duplicate_save_location.clone() {
        tokio::fs::create_dir_all(&location)
            .await
            .map_err(|e| e.to_string())?;

        let lang = match cfg.language.get(&solution.language) {
            Some(base_lang) => base_lang.base.clone(),
            None => {
                warn!(
                    "Unknown language {} for solution {}",
                    &solution.language, &solution.id
                );
                LanguageBase::Unknown
            }
        };

        let problem_url_host = if let Some(url) = problem.url {
            Url::parse(&url)
                .ok()
                .and_then(|u| u.host_str().map(|s| s.to_string()))
                .unwrap_or("unknown".to_string())
        } else {
            "unknown".to_string()
        };

        let filename = format!("{}-{}.{}", &problem.name, &solution.name, lang.extension());
        let group_dir = location.join(problem_url_host);
        let filepath = group_dir.join(&filename);
        if !group_dir.exists() {
            tokio::fs::create_dir_all(&group_dir)
                .await
                .map_err(|e| e.to_string())?;
        }

        let content = if let Some(c) = content {
            c
        } else {
            get_string_of_doc(
                solution.document.unwrap().id,
                String::from("content"),
                db.clone(),
                repo,
            )
            .await
            .map_err(|e| e.to_string())?
        };
        tokio::fs::write(&filepath, &content)
            .await
            .map_err(|e| e.to_string())?;
        trace!("Saved duplicated file to {:?}", &filepath);
        Ok(())
    } else {
        Err("Duplicated save location is not set, please check your settings".to_string())
    }
}

#[cfg(test)]
mod competitive_companion_http_tests {
    use super::*;

    fn post_request(body: &str) -> Vec<u8> {
        format!(
            "POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    #[test]
    fn parses_complete_post_without_waiting_for_eof() {
        let body = r#"{"name":"A"}"#;
        assert_eq!(
            parse_competitive_companion_http_request(&post_request(body)).unwrap(),
            CompetitiveCompanionHttpRequest::Message(body.to_string())
        );
    }

    #[tokio::test]
    async fn reads_complete_request_while_client_stays_connected() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let body = r#"{"name":"A"}"#;
        let request = post_request(body);
        let client = tokio::spawn(async move {
            let mut stream = TcpStream::connect(address).await.unwrap();
            stream.write_all(&request).await.unwrap();
            tokio::time::sleep(Duration::from_secs(1)).await;
        });
        let (mut stream, _) = listener.accept().await.unwrap();

        assert_eq!(
            read_competitive_companion_http_request(&mut stream)
                .await
                .unwrap(),
            CompetitiveCompanionHttpRequest::Message(body.to_string())
        );
        client.abort();
    }

    #[test]
    fn waits_for_the_declared_body_length() {
        let mut request = post_request(r#"{"name":"A"}"#);
        request.pop();
        assert_eq!(
            parse_competitive_companion_http_request(&request).unwrap(),
            CompetitiveCompanionHttpRequest::Incomplete
        );
    }

    #[test]
    fn accepts_cors_preflight() {
        assert_eq!(
            parse_competitive_companion_http_request(
                b"OPTIONS / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
            )
            .unwrap(),
            CompetitiveCompanionHttpRequest::Preflight
        );
    }

    #[test]
    fn rejects_requests_without_content_length() {
        let error = parse_competitive_companion_http_request(
            b"POST / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n{}",
        )
        .unwrap_err();
        assert!(error.contains("Content-Length"));
    }
}
