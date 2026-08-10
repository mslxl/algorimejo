use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use tauri::State;

use crate::{
    config::ProgramConfigRepo,
    document::DocumentRepo,
    runner::{command_flag_hide_new_console, temp_dir},
};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
const CLI_NETWORK_TIMEOUT_SECONDS: &str = "10";

fn cli_path(config: &ProgramConfigRepo, override_path: Option<String>) -> Result<String, String> {
    let configured = match override_path {
        Some(path) => path,
        None => config
            .read()
            .map_err(|error| error.to_string())?
            .wakatime_cli_path
            .clone(),
    };
    let trimmed = configured.trim();
    if trimmed.is_empty() {
        return Err("WakaTime CLI path cannot be empty".to_string());
    }
    Ok(trimmed.to_string())
}

fn safe_filename(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect::<String>();
    let sanitized = sanitized.trim().trim_end_matches(['.', ' ']);
    if sanitized.is_empty() {
        "document".to_string()
    } else {
        sanitized.to_string()
    }
}

fn language_metadata(language: &str) -> (&str, &str) {
    match language {
        "Cpp" => ("C++", "cpp"),
        "Python" => ("Python", "py"),
        "TypeScript" => ("TypeScript", "ts"),
        "JavaScript" => ("JavaScript", "js"),
        "Go" => ("Go", "go"),
        _ => (language, "txt"),
    }
}

fn heartbeat_paths(
    workspace: Option<&PathBuf>,
    document_id: &str,
    entity_name: &str,
    extension: &str,
) -> (PathBuf, PathBuf, String) {
    let project = workspace
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Algorimejo")
        .to_string();
    let project_root = workspace
        .cloned()
        .unwrap_or_else(|| temp_dir("wakatime-project"));
    let entity_name = safe_filename(entity_name);
    let entity_filename = if Path::new(&entity_name)
        .extension()
        .is_some_and(|value| value.to_string_lossy().eq_ignore_ascii_case(extension))
    {
        entity_name
    } else {
        format!("{entity_name}.{extension}")
    };
    let entity = project_root.join(entity_filename);
    let local_file =
        temp_dir("wakatime").join(format!("{}.{}", safe_filename(document_id), extension));
    (entity, local_file, project)
}

fn heartbeat_args(
    entity: &Path,
    local_file: &Path,
    project: &str,
    language: &str,
    is_write: bool,
) -> Vec<OsString> {
    let mut args = vec![
        "--entity".into(),
        entity.as_os_str().to_owned(),
        "--local-file".into(),
        local_file.as_os_str().to_owned(),
        "--is-unsaved-entity".into(),
        "--plugin".into(),
        format!("algorimejo/{}", env!("CARGO_PKG_VERSION")).into(),
        "--alternate-project".into(),
        project.into(),
        "--language".into(),
        language.into(),
        "--timeout".into(),
        CLI_NETWORK_TIMEOUT_SECONDS.into(),
    ];
    if is_write {
        args.push("--write".into());
    }
    args
}

async fn run_cli(path: &str, args: &[OsString]) -> Result<String, String> {
    let mut command = Command::new(path);
    command.args(args);
    command_flag_hide_new_console(&mut command);

    let mut command = tokio::process::Command::from(command);
    command.kill_on_drop(true);
    let output = tokio::time::timeout(COMMAND_TIMEOUT, command.output())
        .await
        .map_err(|_| {
            format!(
                "WakaTime CLI timed out after {} seconds",
                COMMAND_TIMEOUT.as_secs()
            )
        })?
        .map_err(|error| format!("Failed to start WakaTime CLI at {path}: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let details = if stderr.is_empty() { stdout } else { stderr };
        return Err(format!(
            "WakaTime CLI exited with {}{}",
            output.status,
            if details.is_empty() {
                String::new()
            } else {
                format!(": {details}")
            }
        ));
    }
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

#[tauri::command]
#[specta::specta]
pub async fn check_wakatime_cli(
    config: State<'_, ProgramConfigRepo>,
    path: Option<String>,
) -> Result<String, String> {
    let path = cli_path(&config, path)?;
    let output = run_cli(&path, &["--version".into()]).await?;
    if output.is_empty() {
        Ok("wakatime-cli is available".to_string())
    } else {
        Ok(output)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn send_wakatime_heartbeat(
    config: State<'_, ProgramConfigRepo>,
    documents: State<'_, DocumentRepo>,
    document_id: String,
    entity_name: String,
    language: String,
    is_write: bool,
) -> Result<(), String> {
    let (enabled, path, workspace) = {
        let config = config.read().map_err(|error| error.to_string())?;
        (
            config.wakatime_enabled,
            config.wakatime_cli_path.clone(),
            config.workspace.clone(),
        )
    };
    if !enabled {
        return Ok(());
    }

    let path = cli_path(&config, Some(path))?;

    let content = documents
        .get_string_of_doc(&document_id, "content")
        .map_err(|error| error.to_string())?;
    let (wakatime_language, extension) = language_metadata(&language);
    let (entity, local_file, project) =
        heartbeat_paths(workspace.as_ref(), &document_id, &entity_name, extension);
    if let Some(parent) = local_file.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("Failed to create WakaTime temporary directory: {error}"))?;
    }
    tokio::fs::write(&local_file, content)
        .await
        .map_err(|error| format!("Failed to write WakaTime temporary source file: {error}"))?;

    let args = heartbeat_args(&entity, &local_file, &project, wakatime_language, is_write);
    let result = run_cli(&path, &args).await;
    if let Err(error) = tokio::fs::remove_file(&local_file).await {
        log::warn!(
            "Failed to remove WakaTime temporary source file {}: {error}",
            local_file.display()
        );
    }
    result.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_entity_names() {
        assert_eq!(safe_filename("A/B: solution?.cpp"), "A_B_ solution_.cpp");
        assert_eq!(safe_filename("..."), "document");
    }

    #[test]
    fn write_heartbeat_contains_expected_flags() {
        let args = heartbeat_args(
            Path::new("/workspace/solution.cpp"),
            Path::new("/tmp/source.cpp"),
            "workspace",
            "C++",
            true,
        );
        assert!(args.contains(&OsString::from("--is-unsaved-entity")));
        assert!(args.contains(&OsString::from("--alternate-project")));
        assert!(args.contains(&OsString::from("--write")));
    }
}
