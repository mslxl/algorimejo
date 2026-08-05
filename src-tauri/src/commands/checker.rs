use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use tauri::{path::BaseDirectory, AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::{
    commands::runner::get_default_env,
    database::{config::AdvLanguageItem, DatabaseRepo},
    document::DocumentRepo,
    model::{Checker, CheckerKind, CheckerSelfTest},
    runner::{
        checker_sdk::{materialize_sdk, sdk_info, source_path, CheckerSdkInfo},
        cmd::parse_command_with_env,
        run::{launch_program_without_input, ProgramSimpleOutput},
    },
};

const CHECKER_COMPILE_TIMEOUT: u128 = 12_000;
const CHECKER_RUN_TIMEOUT: u128 = 12_000;
const CHECKER_SDK_VERSION: &str = "2";

#[derive(Default)]
pub struct CheckerBuildState {
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl CheckerBuildState {
    async fn lock_for(&self, checker_id: &str) -> Arc<Mutex<()>> {
        let mut locks = self.locks.lock().await;
        locks
            .entry(checker_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub enum CheckerBuildStatus {
    Ready,
    CompileError,
    CompileTimeout,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckerBuildResult {
    pub status: CheckerBuildStatus,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub cache_hit: bool,
    pub source_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub enum CheckerRunVerdict {
    AC,
    WA,
    PE,
    CHKCE,
    CHKCETLE,
    CHKTLE,
    CHKRE,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckerRunResult {
    pub verdict: CheckerRunVerdict,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub is_timeout: bool,
    pub build: Option<CheckerBuildResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckerEditorInfo {
    pub source_path: PathBuf,
    pub sdk: CheckerSdkInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckerSelfTestResult {
    pub self_test: CheckerSelfTest,
    pub run: CheckerRunResult,
    pub passed: bool,
}

struct PreparedChecker {
    language: AdvLanguageItem,
    directory: PathBuf,
    build: CheckerBuildResult,
}

fn workspace_cache_key(db: &DatabaseRepo) -> String {
    let mut hasher = Sha256::new();
    hasher.update(db.base_folder().to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn checker_cache_root(app: &AppHandle, db: &DatabaseRepo, checker_id: &str) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_cache_dir()?
        .join("checkers")
        .join(workspace_cache_key(db))
        .join(checker_id))
}

pub(crate) async fn remove_checker_cache(
    app: &AppHandle,
    db: &DatabaseRepo,
    checker_id: &str,
) -> Result<()> {
    let directory = checker_cache_root(app, db, checker_id)?;
    if directory.exists() {
        tokio::fs::remove_dir_all(directory).await?;
    }
    Ok(())
}

async fn source_content(
    db: &DatabaseRepo,
    documents: &DocumentRepo,
    checker: &Checker,
) -> Result<String> {
    let document = checker
        .document
        .as_ref()
        .ok_or_else(|| anyhow!("Custom checker has no source document"))?;
    if !documents.has(&document.id) {
        let path = db.get_document_filepath(&document.id)?;
        documents.manage(document.id.clone(), path)?;
    }
    documents.get_string_of_doc(&document.id, "content")
}

fn build_source_path(directory: &Path, language: &AdvLanguageItem) -> PathBuf {
    directory.join(format!("code.{}", language.base.extension()))
}

async fn materialize_editor(
    app: &AppHandle,
    db: &DatabaseRepo,
    documents: &DocumentRepo,
    checker: &Checker,
) -> Result<CheckerEditorInfo> {
    if checker.kind != CheckerKind::Custom {
        return Err(anyhow!("Built-in checkers do not have editable source"));
    }
    let language_name = checker
        .language
        .as_ref()
        .ok_or_else(|| anyhow!("Custom checker has no language"))?;
    let language = db.get_language_item(language_name)?;
    let sdk = sdk_info(language.base.clone())?;
    let directory = checker_cache_root(app, db, &checker.id)?
        .join("editor")
        .join(language.base.extension());
    materialize_sdk(language.base.clone(), &directory).await?;
    let path = source_path(&directory, language.base.clone())?;
    tokio::fs::write(&path, source_content(db, documents, checker).await?).await?;
    Ok(CheckerEditorInfo {
        source_path: path,
        sdk,
    })
}

async fn run_hook(app: &AppHandle, command: &str, directory: &Path, source: &Path) -> Result<()> {
    let mut env = get_default_env(app)?;
    env.insert("CWD".to_string(), directory.display().to_string());
    env.insert("SRC".to_string(), source.display().to_string());
    let mut command = parse_command_with_env(command, &env).map_err(|error| anyhow!(error))?;
    command.current_dir(directory);
    let result = launch_program_without_input(command, 3_000).await?;
    if result.is_timeout {
        return Err(anyhow!("Checker run hook timed out"));
    }
    if result.exit_code != 0 {
        return Err(anyhow!(
            "Checker run hook exited with code {}: {}",
            result.exit_code,
            result.stderr.trim()
        ));
    }
    Ok(())
}

async fn prepare_custom_checker(
    app: &AppHandle,
    db: &DatabaseRepo,
    documents: &DocumentRepo,
    state: &CheckerBuildState,
    checker: Checker,
) -> Result<PreparedChecker> {
    let lock = state.lock_for(&checker.id).await;
    let _guard = lock.lock().await;
    let language_name = checker
        .language
        .as_ref()
        .ok_or_else(|| anyhow!("Custom checker has no language"))?;
    let language = db.get_language_item(language_name)?;
    let content = source_content(db, documents, &checker).await?;

    let mut hasher = Sha256::new();
    hasher.update(CHECKER_SDK_VERSION.as_bytes());
    hasher.update(content.as_bytes());
    hasher.update(serde_json::to_vec(&language)?);
    let hash = format!("{:x}", hasher.finalize());
    let directory = checker_cache_root(app, db, &checker.id)?
        .join("build")
        .join(hash);
    tokio::fs::create_dir_all(&directory).await?;
    materialize_sdk(language.base.clone(), &directory).await?;
    let source = build_source_path(&directory, &language);
    tokio::fs::write(&source, content).await?;
    let ready_marker = directory.join(".ready");

    if ready_marker.exists() {
        return Ok(PreparedChecker {
            language,
            directory,
            build: CheckerBuildResult {
                status: CheckerBuildStatus::Ready,
                stdout: String::new(),
                stderr: String::new(),
                exit_code: 0,
                cache_hit: true,
                source_path: source,
            },
        });
    }

    let compile_output = if language.cmd_compile.trim().is_empty() {
        ProgramSimpleOutput {
            exit_code: 0,
            stdout: String::new(),
            stderr: String::new(),
            is_timeout: false,
        }
    } else {
        let mut env = get_default_env(app)?;
        env.insert("CWD".to_string(), directory.display().to_string());
        env.insert("SRC".to_string(), source.display().to_string());
        env.insert("CHECKER_SDK".to_string(), directory.display().to_string());
        let mut command =
            parse_command_with_env(&language.cmd_compile, &env).map_err(|error| anyhow!(error))?;
        command.current_dir(&directory);
        launch_program_without_input(command, CHECKER_COMPILE_TIMEOUT).await?
    };
    let status = if compile_output.is_timeout {
        CheckerBuildStatus::CompileTimeout
    } else if compile_output.exit_code != 0 {
        CheckerBuildStatus::CompileError
    } else {
        tokio::fs::write(&ready_marker, b"ready").await?;
        CheckerBuildStatus::Ready
    };
    let build = CheckerBuildResult {
        status,
        stdout: compile_output.stdout,
        stderr: compile_output.stderr,
        exit_code: compile_output.exit_code,
        cache_hit: false,
        source_path: source,
    };
    Ok(PreparedChecker {
        language,
        directory,
        build,
    })
}

async fn execute_prepared(
    app: &AppHandle,
    prepared: PreparedChecker,
    input: &Path,
    output: &Path,
    answer: &Path,
) -> Result<CheckerRunResult> {
    if prepared.build.status != CheckerBuildStatus::Ready {
        let verdict = match prepared.build.status {
            CheckerBuildStatus::CompileTimeout => CheckerRunVerdict::CHKCETLE,
            _ => CheckerRunVerdict::CHKCE,
        };
        return Ok(CheckerRunResult {
            verdict,
            message: prepared.build.stderr.clone(),
            stdout: String::new(),
            stderr: prepared.build.stderr.clone(),
            exit_code: prepared.build.exit_code,
            is_timeout: prepared.build.status == CheckerBuildStatus::CompileTimeout,
            build: Some(prepared.build),
        });
    }

    if let Some(command) = prepared.language.cmd_before_run.as_deref() {
        run_hook(
            app,
            command,
            &prepared.directory,
            &prepared.build.source_path,
        )
        .await?;
    }
    let mut env = get_default_env(app)?;
    env.insert("CWD".to_string(), prepared.directory.display().to_string());
    env.insert(
        "SRC".to_string(),
        prepared.build.source_path.display().to_string(),
    );
    let mut command =
        parse_command_with_env(&prepared.language.cmd_run, &env).map_err(|error| anyhow!(error))?;
    command
        .current_dir(&prepared.directory)
        .arg(input)
        .arg(output)
        .arg(answer);
    let run = launch_program_without_input(command, CHECKER_RUN_TIMEOUT).await;
    let cleanup = match prepared.language.cmd_after_run.as_deref() {
        Some(command) => {
            run_hook(
                app,
                command,
                &prepared.directory,
                &prepared.build.source_path,
            )
            .await
        }
        None => Ok(()),
    };
    let run = run?;
    cleanup?;
    Ok(run_result(run, Some(prepared.build)))
}

fn run_result(run: ProgramSimpleOutput, build: Option<CheckerBuildResult>) -> CheckerRunResult {
    let verdict = if run.is_timeout {
        CheckerRunVerdict::CHKTLE
    } else {
        match run.exit_code {
            0 => CheckerRunVerdict::AC,
            1 => CheckerRunVerdict::WA,
            2 => CheckerRunVerdict::PE,
            _ => CheckerRunVerdict::CHKRE,
        }
    };
    let message = if run.stderr.trim().is_empty() {
        run.stdout.trim().to_string()
    } else {
        run.stderr.trim().to_string()
    };
    CheckerRunResult {
        verdict,
        message,
        stdout: run.stdout,
        stderr: run.stderr,
        exit_code: run.exit_code,
        is_timeout: run.is_timeout,
        build,
    }
}

fn verdict_name(verdict: &CheckerRunVerdict) -> &'static str {
    match verdict {
        CheckerRunVerdict::AC => "AC",
        CheckerRunVerdict::WA => "WA",
        CheckerRunVerdict::PE => "PE",
        CheckerRunVerdict::CHKCE => "CHKCE",
        CheckerRunVerdict::CHKCETLE => "CHKCETLE",
        CheckerRunVerdict::CHKTLE => "CHKTLE",
        CheckerRunVerdict::CHKRE => "CHKRE",
    }
}

fn checker_error(verdict: CheckerRunVerdict, message: impl Into<String>) -> CheckerRunResult {
    let message = message.into();
    CheckerRunResult {
        verdict,
        message: message.clone(),
        stdout: String::new(),
        stderr: message,
        exit_code: -1,
        is_timeout: false,
        build: None,
    }
}

async fn execute_checker_impl(
    app: &AppHandle,
    db: &DatabaseRepo,
    documents: &DocumentRepo,
    state: &CheckerBuildState,
    checker: Checker,
    input: &Path,
    output: &Path,
    answer: &Path,
) -> Result<CheckerRunResult> {
    match checker.kind {
        CheckerKind::Builtin => {
            let executable = app.path().resolve(
                format!(
                    "testlib/{}{}",
                    checker.name,
                    if cfg!(target_os = "windows") {
                        ".exe"
                    } else {
                        ""
                    }
                ),
                BaseDirectory::Resource,
            )?;
            let mut command = Command::new(executable);
            command.arg(input).arg(output).arg(answer);
            Ok(
                match launch_program_without_input(command, CHECKER_RUN_TIMEOUT).await {
                    Ok(run) => run_result(run, None),
                    Err(error) => checker_error(CheckerRunVerdict::CHKRE, error.to_string()),
                },
            )
        }
        CheckerKind::Custom => {
            let prepared = match prepare_custom_checker(app, db, documents, state, checker).await {
                Ok(prepared) => prepared,
                Err(error) => {
                    return Ok(checker_error(CheckerRunVerdict::CHKCE, error.to_string()))
                }
            };
            Ok(
                match execute_prepared(app, prepared, input, output, answer).await {
                    Ok(run) => run,
                    Err(error) => checker_error(CheckerRunVerdict::CHKRE, error.to_string()),
                },
            )
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_checker_sdk_info(
    language: String,
    db: State<'_, DatabaseRepo>,
) -> Result<CheckerSdkInfo, String> {
    let language = db
        .get_language_item(&language)
        .map_err(|error| error.to_string())?;
    sdk_info(language.base).map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_checker_editor_info(
    app: AppHandle,
    checker_id: String,
    db: State<'_, DatabaseRepo>,
    documents: State<'_, DocumentRepo>,
) -> Result<CheckerEditorInfo, String> {
    let checker = db
        .get_checker(&checker_id)
        .map_err(|error| error.to_string())?;
    materialize_editor(&app, &db, &documents, &checker)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn build_checker(
    app: AppHandle,
    checker_id: String,
    db: State<'_, DatabaseRepo>,
    documents: State<'_, DocumentRepo>,
    state: State<'_, CheckerBuildState>,
) -> Result<CheckerBuildResult, String> {
    let checker = db
        .get_checker(&checker_id)
        .map_err(|error| error.to_string())?;
    if checker.kind != CheckerKind::Custom {
        return Err("Built-in checkers do not need to be built".to_string());
    }
    prepare_custom_checker(&app, &db, &documents, &state, checker)
        .await
        .map(|prepared| prepared.build)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn execute_checker(
    app: AppHandle,
    problem_id: String,
    checker_id: String,
    input_filename: PathBuf,
    output_filename: PathBuf,
    answer_filename: PathBuf,
    db: State<'_, DatabaseRepo>,
    documents: State<'_, DocumentRepo>,
    state: State<'_, CheckerBuildState>,
) -> Result<CheckerRunResult, String> {
    let checker = db
        .get_visible_checker(&problem_id, &checker_id)
        .map_err(|error| error.to_string())?;
    execute_checker_impl(
        &app,
        &db,
        &documents,
        &state,
        checker,
        &input_filename,
        &output_filename,
        &answer_filename,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn run_checker_self_test(
    app: AppHandle,
    self_test_id: String,
    db: State<'_, DatabaseRepo>,
    documents: State<'_, DocumentRepo>,
    state: State<'_, CheckerBuildState>,
) -> Result<CheckerSelfTestResult, String> {
    let self_test = db
        .get_checker_self_test(&self_test_id)
        .map_err(|error| error.to_string())?;
    let checker = db
        .get_checker(&self_test.checker_id)
        .map_err(|error| error.to_string())?;
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("checker-self-tests")
        .join(&self_test.id);
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|error| error.to_string())?;
    let input = directory.join("input.txt");
    let output = directory.join("output.txt");
    let answer = directory.join("answer.txt");
    tokio::try_join!(
        tokio::fs::write(&input, &self_test.input),
        tokio::fs::write(&output, &self_test.output),
        tokio::fs::write(&answer, &self_test.answer),
    )
    .map_err(|error| error.to_string())?;
    let run = execute_checker_impl(
        &app, &db, &documents, &state, checker, &input, &output, &answer,
    )
    .await;
    if let Err(error) = tokio::fs::remove_dir_all(&directory).await {
        log::warn!("Failed to remove Checker self-test directory: {error}");
    }
    let run = run.map_err(|error| error.to_string())?;
    let passed = verdict_name(&run.verdict) == self_test.expected_verdict;
    Ok(CheckerSelfTestResult {
        self_test,
        run,
        passed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn output(exit_code: i32, is_timeout: bool) -> ProgramSimpleOutput {
        ProgramSimpleOutput {
            exit_code,
            stdout: String::new(),
            stderr: String::new(),
            is_timeout,
        }
    }

    #[test]
    fn checker_exit_codes_map_to_stable_verdicts() {
        assert_eq!(
            run_result(output(0, false), None).verdict,
            CheckerRunVerdict::AC
        );
        assert_eq!(
            run_result(output(1, false), None).verdict,
            CheckerRunVerdict::WA
        );
        assert_eq!(
            run_result(output(2, false), None).verdict,
            CheckerRunVerdict::PE
        );
        assert_eq!(
            run_result(output(3, false), None).verdict,
            CheckerRunVerdict::CHKRE
        );
        assert_eq!(
            run_result(output(17, false), None).verdict,
            CheckerRunVerdict::CHKRE
        );
        assert_eq!(
            run_result(output(0, true), None).verdict,
            CheckerRunVerdict::CHKTLE
        );
    }
}
