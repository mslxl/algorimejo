use std::{
    collections::HashSet,
    fs::File,
    io,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, Instant},
};

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use tauri::Manager;
use tauri_specta::Event;
use tokio::{io::AsyncWriteExt, sync::Mutex};

use crate::{
    commands::runner::ENV_KEY_MANAGED_LSP, database::language::LanguageBase,
    runner::command_flag_hide_new_console,
};

const INSTALL_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_DOWNLOAD_SIZE: u64 = 512 * 1024 * 1024;
const MANIFEST_FILE: &str = "install.json";

const CPP_LANGUAGES: &[LanguageBase] = &[LanguageBase::Cpp];
const PYTHON_LANGUAGES: &[LanguageBase] = &[LanguageBase::Python];
const TYPESCRIPT_LANGUAGES: &[LanguageBase] = &[LanguageBase::TypeScript, LanguageBase::JavaScript];
const GO_LANGUAGES: &[LanguageBase] = &[LanguageBase::Go];

#[derive(Default)]
pub struct LanguageServerManagerState {
    active_packages: Mutex<HashSet<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LanguageServerPackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub languages: Vec<LanguageBase>,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub launch_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum LanguageServerInstallProgress {
    Preparing,
    Downloading {
        artifact: String,
        downloaded: u64,
        total: Option<u64>,
        artifact_index: usize,
        artifact_count: usize,
    },
    Extracting {
        artifact: String,
        artifact_index: usize,
        artifact_count: usize,
    },
    Installing {
        detail: String,
    },
    Activating,
}

#[derive(Debug, Clone, Serialize, Deserialize, Event, Type)]
pub struct LanguageServerInstallProgressEvent {
    operation_id: String,
    package_id: String,
    progress: LanguageServerInstallProgress,
}

#[derive(Clone, Copy)]
enum ArchiveFormat {
    Zip,
    TarGz,
}

#[derive(Clone, Copy)]
struct DownloadArtifact {
    url: &'static str,
    sha256: &'static str,
    format: ArchiveFormat,
}

#[derive(Clone, Copy)]
struct NodePackageArtifact {
    name: &'static str,
    artifact: DownloadArtifact,
    destination: &'static str,
    required_file: &'static str,
}

#[derive(Clone, Copy)]
enum Installer {
    Archive {
        artifact: DownloadArtifact,
        executable_name: &'static str,
    },
    Node {
        runtime: DownloadArtifact,
        runtime_executable: &'static str,
        packages: &'static [NodePackageArtifact],
        server_script: &'static str,
    },
    ManagedGo {
        runtime: DownloadArtifact,
        runtime_executable: &'static str,
        package: &'static str,
        executable: &'static str,
    },
}

#[derive(Clone, Copy)]
struct RegistryPackage {
    id: &'static str,
    name: &'static str,
    version: &'static str,
    languages: &'static [LanguageBase],
    launch_arguments: &'static [&'static str],
    installer: Installer,
}

#[derive(Clone)]
struct InstallProgressReporter {
    app: tauri::AppHandle,
    operation_id: String,
    package_id: String,
    artifact_count: usize,
}

impl InstallProgressReporter {
    fn new(app: tauri::AppHandle, operation_id: String, package: RegistryPackage) -> Self {
        let artifact_count = match package.installer {
            Installer::Archive { .. } | Installer::ManagedGo { .. } => 1,
            Installer::Node { packages, .. } => packages.len() + 1,
        };
        Self {
            app,
            operation_id,
            package_id: package.id.to_string(),
            artifact_count,
        }
    }

    fn emit(&self, progress: LanguageServerInstallProgress) {
        if let Err(error) = (LanguageServerInstallProgressEvent {
            operation_id: self.operation_id.clone(),
            package_id: self.package_id.clone(),
            progress,
        })
        .emit(&self.app)
        {
            log::warn!("failed to emit language server installation progress: {error}");
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct InstallManifest {
    id: String,
    version: String,
    executable: PathBuf,
}

fn clangd_artifact() -> Option<DownloadArtifact> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some(DownloadArtifact {
            url: "https://github.com/clangd/clangd/releases/download/20.1.8/clangd-windows-20.1.8.zip",
            sha256: "717a0700fc660574647468b3d0b67e46a077d27e4da794d9d0c212add6ba6765",
            format: ArchiveFormat::Zip,
        })
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some(DownloadArtifact {
            url:
                "https://github.com/clangd/clangd/releases/download/20.1.8/clangd-linux-20.1.8.zip",
            sha256: "98493005e2c7532e69827987d909c46295e2ee997a48228606e7777547994490",
            format: ArchiveFormat::Zip,
        })
    } else if cfg!(target_os = "macos") {
        Some(DownloadArtifact {
            url: "https://github.com/clangd/clangd/releases/download/20.1.8/clangd-mac-20.1.8.zip",
            sha256: "c2303d0a83dcb31c08c4920e815586ad1b0c17ee8d1a484d605f33d784a31402",
            format: ArchiveFormat::Zip,
        })
    } else {
        None
    }
}

fn node_artifact() -> Option<DownloadArtifact> {
    let (url, sha256, format) = if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        (
            "https://nodejs.org/dist/v24.13.0/node-v24.13.0-win-x64.zip",
            "ca2742695be8de44027d71b3f53a4bdb36009b95575fe1ae6f7f0b5ce091cb88",
            ArchiveFormat::Zip,
        )
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        (
            "https://nodejs.org/dist/v24.13.0/node-v24.13.0-win-arm64.zip",
            "92b9f9b0c0c123e11e4afc535f0ec19cd987465eea506427553a49971364158a",
            ArchiveFormat::Zip,
        )
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        (
            "https://nodejs.org/dist/v24.13.0/node-v24.13.0-linux-x64.tar.gz",
            "6223aad1a81f9d1e7b682c59d12e2de233f7b4c37475cd40d1c89c42b737ffa8",
            ArchiveFormat::TarGz,
        )
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        (
            "https://nodejs.org/dist/v24.13.0/node-v24.13.0-linux-arm64.tar.gz",
            "0f6d40b94c6a2eb6b4c240ffc8b9fd3ada7ab044c177dd413c06e1ef9a63f081",
            ArchiveFormat::TarGz,
        )
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        (
            "https://nodejs.org/dist/v24.13.0/node-v24.13.0-darwin-x64.tar.gz",
            "6f03c1b48ddbe1b129a6f8038be08e0899f05f17185b4d3e4350180ab669a7f3",
            ArchiveFormat::TarGz,
        )
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        (
            "https://nodejs.org/dist/v24.13.0/node-v24.13.0-darwin-arm64.tar.gz",
            "d595961e563fcae057d4a0fb992f175a54d97fcc4a14dc2d474d92ddeea3b9f8",
            ArchiveFormat::TarGz,
        )
    } else {
        return None;
    };

    Some(DownloadArtifact {
        url,
        sha256,
        format,
    })
}

fn go_artifact() -> Option<DownloadArtifact> {
    let (url, sha256, format) = if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        (
            "https://go.dev/dl/go1.26.5.windows-amd64.zip",
            "97e6b2a833b6d89f9ff17d25419ac0a7e3b482a044e9ab18cdef834bd834fd38",
            ArchiveFormat::Zip,
        )
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        (
            "https://go.dev/dl/go1.26.5.windows-arm64.zip",
            "f96ee46396d69f1e231c8d981ec6a70216238a646a1f2cd74aea0d0016bbc017",
            ArchiveFormat::Zip,
        )
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        (
            "https://go.dev/dl/go1.26.5.linux-amd64.tar.gz",
            "5c2c3b16caefa1d968a94c1daca04a7ca301a496d9b086e17ad77bb81393f053",
            ArchiveFormat::TarGz,
        )
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        (
            "https://go.dev/dl/go1.26.5.linux-arm64.tar.gz",
            "fe4789e92b1f33358680864bbe8704289e7bb5fc207d80623c308935bd696d49",
            ArchiveFormat::TarGz,
        )
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        (
            "https://go.dev/dl/go1.26.5.darwin-amd64.tar.gz",
            "6231d8d3b8f5552ec6cbf6d685bdd5482e1e703214b120e89b3bf0d7bf1ef725",
            ArchiveFormat::TarGz,
        )
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        (
            "https://go.dev/dl/go1.26.5.darwin-arm64.tar.gz",
            "efb87ff28af9a188d0536ef5d42e63dd52ba8263cd7344a993cc48dd11dedb6a",
            ArchiveFormat::TarGz,
        )
    } else {
        return None;
    };

    Some(DownloadArtifact {
        url,
        sha256,
        format,
    })
}

fn registry() -> Vec<RegistryPackage> {
    let mut packages = Vec::new();
    if let Some(artifact) = clangd_artifact() {
        packages.push(RegistryPackage {
            id: "clangd",
            name: "clangd",
            version: "20.1.8",
            languages: CPP_LANGUAGES,
            launch_arguments: &[],
            installer: Installer::Archive {
                artifact,
                executable_name: if cfg!(target_os = "windows") {
                    "clangd.exe"
                } else {
                    "clangd"
                },
            },
        });
    }
    if let Some(runtime) = node_artifact() {
        let runtime_executable = if cfg!(target_os = "windows") {
            "runtime/node.exe"
        } else {
            "runtime/bin/node"
        };
        packages.extend([
            RegistryPackage {
            id: "pyright",
            name: "Pyright",
            version: "1.1.403",
            languages: PYTHON_LANGUAGES,
            launch_arguments: &["--stdio"],
            installer: Installer::Node {
                runtime,
                runtime_executable,
                packages: &[NodePackageArtifact {
                    name: "Pyright",
                    artifact: DownloadArtifact {
                        url: "https://registry.npmjs.org/pyright/-/pyright-1.1.403.tgz",
                        sha256: "d62b36fcff0a5f67b8cfc25b5618bc232a8e0b714593e25a83cdbba3d47eec9d",
                        format: ArchiveFormat::TarGz,
                    },
                    destination: "node_modules/pyright",
                    required_file: "langserver.index.js",
                }],
                server_script: "node_modules/pyright/langserver.index.js",
            },
        },
        RegistryPackage {
            id: "typescript-language-server",
            name: "TypeScript Language Server",
            version: "4.3.4",
            languages: TYPESCRIPT_LANGUAGES,
            launch_arguments: &["--stdio"],
            installer: Installer::Node {
                runtime,
                runtime_executable,
                packages: &[
                    NodePackageArtifact {
                        name: "TypeScript Language Server",
                        artifact: DownloadArtifact {
                            url: "https://registry.npmjs.org/typescript-language-server/-/typescript-language-server-4.3.4.tgz",
                            sha256: "9a8aef1dd532f9b4b38087b002b949d9e761ab31fe1dc2f0bfe43ac223150385",
                            format: ArchiveFormat::TarGz,
                        },
                        destination: "node_modules/typescript-language-server",
                        required_file: "lib/cli.mjs",
                    },
                    NodePackageArtifact {
                        name: "TypeScript",
                        artifact: DownloadArtifact {
                            url: "https://registry.npmjs.org/typescript/-/typescript-5.9.2.tgz",
                            sha256: "67a3bc82e822b8f45f653a80fc3a9730d23214d36c83ba85dd7f5abebee82062",
                            format: ArchiveFormat::TarGz,
                        },
                        destination: "node_modules/typescript",
                        required_file: "lib/typescript.js",
                    },
                ],
                server_script: "node_modules/typescript-language-server/lib/cli.mjs",
            },
        },
        ]);
    }
    if let Some(runtime) = go_artifact() {
        packages.push(RegistryPackage {
            id: "gopls",
            name: "gopls",
            version: "v0.23.0",
            languages: GO_LANGUAGES,
            launch_arguments: &[],
            installer: Installer::ManagedGo {
                runtime,
                runtime_executable: if cfg!(target_os = "windows") {
                    ".toolchain/bin/go.exe"
                } else {
                    ".toolchain/bin/go"
                },
                package: "golang.org/x/tools/gopls@v0.23.0",
                executable: if cfg!(target_os = "windows") {
                    "bin/gopls.exe"
                } else {
                    "bin/gopls"
                },
            },
        });
    }
    packages
}

fn registry_package(id: &str) -> Result<RegistryPackage> {
    registry()
        .into_iter()
        .find(|package| package.id == id)
        .ok_or_else(|| anyhow!("Unknown language server package: {id}"))
}

fn managed_root(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join("language-servers"))
}

pub fn recover_managed_language_servers(app: &tauri::AppHandle) -> Result<()> {
    let root = managed_root(app)?;
    if !root.is_dir() {
        return Ok(());
    }

    for package in registry() {
        if let Err(error) = recover_package_backup(&root, package) {
            log::warn!(
                "failed to recover language server package {}: {error}",
                package.id
            );
        }
    }

    cleanup_stale_installation_entries(&root)?;
    Ok(())
}

fn cleanup_stale_installation_entries(root: &Path) -> Result<()> {
    for entry in std::fs::read_dir(root)? {
        let path = entry?.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with(".install-") || name.starts_with(".download-") {
            if let Err(error) = remove_managed_entry(&path) {
                log::warn!(
                    "failed to remove stale language server installation entry {}: {error}",
                    path.display()
                );
            }
        }
    }
    Ok(())
}

fn recover_package_backup(root: &Path, package: RegistryPackage) -> Result<()> {
    let destination = package_dir(root, package);
    let backup_prefix = format!(".backup-{}-", package.id);
    let mut backups = std::fs::read_dir(root)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| name.starts_with(&backup_prefix))
        })
        .collect::<Vec<_>>();
    backups.sort_by_key(|path| {
        std::cmp::Reverse(
            path.metadata()
                .and_then(|metadata| metadata.modified())
                .ok(),
        )
    });

    let mut recovered = None;
    if !valid_package_directory(&destination, package) {
        if let Some(backup) = backups
            .iter()
            .find(|backup| valid_package_directory(backup, package))
        {
            if destination.exists() {
                remove_managed_entry(&destination)?;
            }
            std::fs::rename(backup, &destination)?;
            recovered = Some(backup.clone());
            log::info!(
                "recovered interrupted language server update for {}",
                package.id
            );
        }
    }

    for backup in backups {
        if recovered.as_ref() != Some(&backup) && backup.exists() {
            remove_managed_entry(&backup)?;
        }
    }
    Ok(())
}

fn remove_managed_entry(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

fn package_dir(root: &Path, package: RegistryPackage) -> PathBuf {
    root.join(package.id)
}

fn valid_package_manifest(
    directory: &Path,
    package: RegistryPackage,
    manifest: &InstallManifest,
) -> bool {
    if manifest.id != package.id || !directory.join(&manifest.executable).is_file() {
        return false;
    }
    match package.installer {
        Installer::Node {
            packages,
            server_script,
            ..
        } => {
            directory.join(server_script).is_file()
                && packages.iter().all(|artifact| {
                    directory
                        .join(artifact.destination)
                        .join(artifact.required_file)
                        .is_file()
                })
        }
        Installer::Archive { .. } | Installer::ManagedGo { .. } => true,
    }
}

fn valid_package_directory(directory: &Path, package: RegistryPackage) -> bool {
    std::fs::read(directory.join(MANIFEST_FILE))
        .ok()
        .and_then(|data| serde_json::from_slice::<InstallManifest>(&data).ok())
        .is_some_and(|manifest| valid_package_manifest(directory, package, &manifest))
}

async fn read_manifest(directory: &Path) -> Result<InstallManifest> {
    let data = tokio::fs::read(directory.join(MANIFEST_FILE)).await?;
    Ok(serde_json::from_slice(&data)?)
}

fn managed_command_path(package: RegistryPackage, executable: &Path) -> String {
    format!(
        "%{}/{}/{}",
        ENV_KEY_MANAGED_LSP,
        package.id,
        executable.to_string_lossy().replace('\\', "/")
    )
}

fn launch_command(package: RegistryPackage, manifest: &InstallManifest) -> String {
    let executable = managed_command_path(package, &manifest.executable);
    let mut parts = match package.installer {
        Installer::Node { server_script, .. } => vec![
            executable,
            managed_command_path(package, Path::new(server_script)),
        ],
        Installer::Archive { .. } | Installer::ManagedGo { .. } => vec![executable],
    };
    parts.extend(
        package
            .launch_arguments
            .iter()
            .map(|value| value.to_string()),
    );
    parts.join(" ")
}

async fn package_status(root: &Path, package: RegistryPackage) -> LanguageServerPackage {
    let directory = package_dir(root, package);
    let manifest = read_manifest(&directory).await.ok();
    let valid_manifest =
        manifest.filter(|manifest| valid_package_manifest(&directory, package, manifest));

    LanguageServerPackage {
        id: package.id.to_string(),
        name: package.name.to_string(),
        version: package.version.to_string(),
        languages: package.languages.to_vec(),
        installed: valid_manifest.is_some(),
        installed_version: valid_manifest
            .as_ref()
            .map(|manifest| manifest.version.clone()),
        launch_command: valid_manifest
            .as_ref()
            .map(|manifest| launch_command(package, manifest)),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn list_language_server_packages(
    app: tauri::AppHandle,
) -> Result<Vec<LanguageServerPackage>, String> {
    let root = managed_root(&app).map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for package in registry() {
        result.push(package_status(&root, package).await);
    }
    Ok(result)
}

async fn set_package_active(state: &LanguageServerManagerState, package_id: &str) -> Result<()> {
    let mut active = state.active_packages.lock().await;
    if !active.insert(package_id.to_string()) {
        bail!("Language server package {package_id} is already being modified");
    }
    Ok(())
}

async fn clear_package_active(state: &LanguageServerManagerState, package_id: &str) {
    state.active_packages.lock().await.remove(package_id);
}

#[tauri::command]
#[specta::specta]
pub async fn install_language_server_package(
    app: tauri::AppHandle,
    state: tauri::State<'_, LanguageServerManagerState>,
    package_id: String,
    operation_id: String,
) -> Result<LanguageServerPackage, String> {
    let package = registry_package(&package_id).map_err(|error| error.to_string())?;
    let reporter = InstallProgressReporter::new(app.clone(), operation_id, package);
    set_package_active(&state, &package_id)
        .await
        .map_err(|error| error.to_string())?;
    reporter.emit(LanguageServerInstallProgress::Preparing);

    let root = managed_root(&app).map_err(|error| error.to_string());
    let result = match root {
        Ok(root) => install_package(&root, package, &reporter)
            .await
            .map(|_| root)
            .map_err(|error| error.to_string()),
        Err(error) => Err(error),
    };
    clear_package_active(&state, &package_id).await;

    let root = result?;
    Ok(package_status(&root, package).await)
}

async fn install_package(
    root: &Path,
    package: RegistryPackage,
    reporter: &InstallProgressReporter,
) -> Result<()> {
    tokio::fs::create_dir_all(root).await?;
    let temporary = root.join(format!(".install-{}-{}", package.id, uuid::Uuid::new_v4()));
    tokio::fs::create_dir(&temporary).await?;

    let result = async {
        let executable = install_into(&temporary, package, reporter).await?;
        let manifest = InstallManifest {
            id: package.id.to_string(),
            version: package.version.to_string(),
            executable,
        };
        tokio::fs::write(
            temporary.join(MANIFEST_FILE),
            serde_json::to_vec_pretty(&manifest)?,
        )
        .await?;

        reporter.emit(LanguageServerInstallProgress::Activating);
        replace_package_directory(root, package, &temporary).await
    }
    .await;

    if result.is_err() && temporary.exists() {
        if let Err(error) = tokio::fs::remove_dir_all(&temporary).await {
            log::warn!("failed to remove temporary language server package: {error}");
        }
    }
    result
}

async fn replace_package_directory(
    root: &Path,
    package: RegistryPackage,
    temporary: &Path,
) -> Result<()> {
    let destination = package_dir(root, package);
    let backup = root.join(format!(".backup-{}-{}", package.id, uuid::Uuid::new_v4()));
    let had_previous = destination.exists();
    if had_previous {
        tokio::fs::rename(&destination, &backup)
            .await
            .context("Failed to replace the running language server; stop it and try again")?;
    }

    if let Err(error) = tokio::fs::rename(temporary, &destination).await {
        if had_previous {
            if let Err(rollback_error) = tokio::fs::rename(&backup, &destination).await {
                return Err(anyhow!(
                    "failed to activate language server package: {error}; rollback failed: {rollback_error}; previous package remains at {}",
                    backup.display()
                ));
            }
        }
        return Err(error.into());
    }

    if had_previous {
        if let Err(error) = tokio::fs::remove_dir_all(&backup).await {
            log::warn!("failed to remove old language server package: {error}");
        }
    }
    Ok(())
}

async fn install_into(
    directory: &Path,
    package: RegistryPackage,
    reporter: &InstallProgressReporter,
) -> Result<PathBuf> {
    match package.installer {
        Installer::Archive {
            artifact,
            executable_name,
        } => install_archive(directory, artifact, executable_name, package.name, reporter).await,
        Installer::Node {
            runtime,
            runtime_executable,
            packages,
            ..
        } => install_node_server(directory, runtime, runtime_executable, packages, reporter).await,
        Installer::ManagedGo {
            runtime,
            runtime_executable,
            package,
            executable,
        } => {
            install_managed_go(
                directory,
                runtime,
                runtime_executable,
                package,
                executable,
                reporter,
            )
            .await
        }
    }
}

async fn install_archive(
    directory: &Path,
    artifact: DownloadArtifact,
    executable_name: &str,
    artifact_name: &str,
    reporter: &InstallProgressReporter,
) -> Result<PathBuf> {
    download_and_extract(directory, artifact, 0, artifact_name, 1, reporter).await?;
    find_file_named(directory, executable_name)?
        .strip_prefix(directory)
        .map(Path::to_path_buf)
        .map_err(Into::into)
}

async fn install_node_server(
    directory: &Path,
    runtime: DownloadArtifact,
    runtime_executable: &str,
    packages: &[NodePackageArtifact],
    reporter: &InstallProgressReporter,
) -> Result<PathBuf> {
    download_and_extract(
        &directory.join("runtime"),
        runtime,
        1,
        "Node.js runtime",
        1,
        reporter,
    )
    .await?;
    let runtime_executable = PathBuf::from(runtime_executable);
    retain_runtime_executable(directory, &runtime_executable).await?;

    for (index, package) in packages.iter().enumerate() {
        let destination = directory.join(package.destination);
        download_and_extract(
            &destination,
            package.artifact,
            1,
            package.name,
            index + 2,
            reporter,
        )
        .await?;
        if !destination.join(package.required_file).is_file() {
            bail!(
                "Language server archive does not contain {}",
                package.required_file
            );
        }
    }

    Ok(runtime_executable)
}

async fn retain_runtime_executable(directory: &Path, executable: &Path) -> Result<()> {
    let source = directory.join(executable);
    if !source.is_file() {
        bail!(
            "Node runtime archive does not contain {}",
            executable.display()
        );
    }

    // The official Node archive also contains package managers and documentation.
    // Managed language servers only need the runtime executable itself.
    let staged = directory.join(format!(".runtime-{}", uuid::Uuid::new_v4()));
    tokio::fs::rename(&source, &staged).await?;
    tokio::fs::remove_dir_all(directory.join("runtime")).await?;
    if let Some(parent) = source.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::rename(staged, source).await?;
    Ok(())
}

async fn install_managed_go(
    directory: &Path,
    runtime: DownloadArtifact,
    runtime_executable: &str,
    package: &str,
    executable: &str,
    reporter: &InstallProgressReporter,
) -> Result<PathBuf> {
    let toolchain = directory.join(".toolchain");
    download_and_extract(&toolchain, runtime, 1, "Go toolchain", 1, reporter).await?;

    let binary_dir = directory.join("bin");
    let gopath = directory.join(".gopath");
    let cache = directory.join(".gocache");
    let module_cache = directory.join(".gomodcache");
    tokio::fs::create_dir_all(&binary_dir).await?;

    let mut command = Command::new(directory.join(runtime_executable));
    reporter.emit(LanguageServerInstallProgress::Installing {
        detail: "Building gopls with the managed Go toolchain".to_string(),
    });
    command
        .current_dir(directory)
        .env("GOROOT", &toolchain)
        .env("GOBIN", &binary_dir)
        .env("GOPATH", &gopath)
        .env("GOCACHE", &cache)
        .env("GOMODCACHE", &module_cache)
        .env("GOPROXY", "https://proxy.golang.org")
        .env("GOSUMDB", "sum.golang.org")
        .env("GOTOOLCHAIN", "local")
        .env("CGO_ENABLED", "0")
        .args(["install", package]);
    run_managed_command(command, "managed Go toolchain").await?;

    for temporary in [&toolchain, &gopath, &cache, &module_cache] {
        if temporary.exists() {
            if let Err(error) = tokio::fs::remove_dir_all(temporary).await {
                log::warn!("failed to remove temporary Go directory: {error}");
            }
        }
    }

    let executable = PathBuf::from(executable);
    if !directory.join(&executable).is_file() {
        bail!(
            "Managed Go toolchain completed without creating {}",
            executable.display()
        );
    }
    Ok(executable)
}

async fn download_and_extract(
    destination: &Path,
    artifact: DownloadArtifact,
    strip_components: usize,
    artifact_name: &str,
    artifact_index: usize,
    reporter: &InstallProgressReporter,
) -> Result<()> {
    tokio::fs::create_dir_all(destination).await?;
    let archive_path = destination.join(format!(".download-{}", uuid::Uuid::new_v4()));
    let result = async {
        download_artifact(
            &archive_path,
            artifact,
            artifact_name,
            artifact_index,
            reporter,
        )
        .await?;

        reporter.emit(LanguageServerInstallProgress::Extracting {
            artifact: artifact_name.to_string(),
            artifact_index,
            artifact_count: reporter.artifact_count,
        });
        let archive_for_extract = archive_path.clone();
        let destination = destination.to_path_buf();
        tokio::task::spawn_blocking(move || match artifact.format {
            ArchiveFormat::Zip => extract_zip(&archive_for_extract, &destination, strip_components),
            ArchiveFormat::TarGz => {
                extract_tar_gz(&archive_for_extract, &destination, strip_components)
            }
        })
        .await??;
        Ok::<(), anyhow::Error>(())
    }
    .await;

    let remove_result = if archive_path.exists() {
        tokio::fs::remove_file(&archive_path).await
    } else {
        Ok(())
    };
    result?;
    remove_result?;
    Ok(())
}

async fn download_artifact(
    path: &Path,
    artifact: DownloadArtifact,
    artifact_name: &str,
    artifact_index: usize,
    reporter: &InstallProgressReporter,
) -> Result<()> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("Algorimejo/", env!("CARGO_PKG_VERSION")))
        .build()?;
    let mut response = client.get(artifact.url).send().await?.error_for_status()?;
    let total = response.content_length();
    if total.is_some_and(|length| length > MAX_DOWNLOAD_SIZE) {
        bail!("Language server archive exceeds the download limit");
    }

    let mut downloaded = 0_u64;
    let mut last_progress = Instant::now();
    let mut hasher = Sha256::new();
    let mut archive_file = tokio::fs::File::create(path).await?;
    reporter.emit(LanguageServerInstallProgress::Downloading {
        artifact: artifact_name.to_string(),
        downloaded,
        total,
        artifact_index,
        artifact_count: reporter.artifact_count,
    });
    while let Some(chunk) = response.chunk().await? {
        downloaded += chunk.len() as u64;
        if downloaded > MAX_DOWNLOAD_SIZE {
            bail!("Language server archive exceeds the download limit");
        }
        hasher.update(&chunk);
        archive_file.write_all(&chunk).await?;
        if last_progress.elapsed() >= Duration::from_millis(100) {
            reporter.emit(LanguageServerInstallProgress::Downloading {
                artifact: artifact_name.to_string(),
                downloaded,
                total,
                artifact_index,
                artifact_count: reporter.artifact_count,
            });
            last_progress = Instant::now();
        }
    }
    archive_file.flush().await?;
    drop(archive_file);
    reporter.emit(LanguageServerInstallProgress::Downloading {
        artifact: artifact_name.to_string(),
        downloaded,
        total,
        artifact_index,
        artifact_count: reporter.artifact_count,
    });

    let actual = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual != artifact.sha256 {
        bail!(
            "Language server artifact checksum mismatch: expected {}, got {actual}",
            artifact.sha256
        );
    }
    Ok(())
}

fn extract_zip(archive_path: &Path, destination: &Path, strip_components: usize) -> Result<()> {
    let mut archive = zip::ZipArchive::new(File::open(archive_path)?)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let archived = entry
            .enclosed_name()
            .ok_or_else(|| anyhow!("Unsafe path in language server archive"))?;
        let Some(relative) = strip_archive_path(&archived, strip_components)? else {
            continue;
        };
        let output = destination.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&output)?;
            continue;
        }

        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut output_file = File::create(&output)?;
        io::copy(&mut entry, &mut output_file)?;

        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&output, std::fs::Permissions::from_mode(mode))?;
        }
    }
    Ok(())
}

fn extract_tar_gz(archive_path: &Path, destination: &Path, strip_components: usize) -> Result<()> {
    let decoder = flate2::read::GzDecoder::new(File::open(archive_path)?);
    let mut archive = tar::Archive::new(decoder);
    for entry in archive.entries()? {
        let mut entry = entry?;
        let Some(relative) = strip_archive_path(&entry.path()?, strip_components)? else {
            continue;
        };
        let output = destination.join(relative);
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&output)?;
        } else if entry.header().entry_type().is_file() {
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent)?;
            }
            entry.unpack(&output)?;
        }
    }
    Ok(())
}

fn strip_archive_path(path: &Path, strip_components: usize) -> Result<Option<PathBuf>> {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(value) => components.push(value),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir
            | std::path::Component::RootDir
            | std::path::Component::Prefix(_) => {
                bail!("Unsafe path in language server archive")
            }
        }
    }
    if components.len() <= strip_components {
        return Ok(None);
    }
    Ok(Some(
        components.into_iter().skip(strip_components).collect(),
    ))
}

fn find_file_named(directory: &Path, name: &str) -> Result<PathBuf> {
    for entry in std::fs::read_dir(directory)? {
        let path = entry?.path();
        if path.is_dir() {
            if let Ok(found) = find_file_named(&path, name) {
                return Ok(found);
            }
        } else if path.file_name().is_some_and(|value| value == name) {
            return Ok(path);
        }
    }
    bail!("Language server archive does not contain {name}")
}

async fn run_managed_command(mut command: Command, name: &str) -> Result<()> {
    command_flag_hide_new_console(&mut command);
    let mut command = tokio::process::Command::from(command);
    command.kill_on_drop(true);
    let output = tokio::time::timeout(INSTALL_TIMEOUT, command.output())
        .await
        .map_err(|_| anyhow!("{name} installation timed out"))??;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    bail!(
        "{name} exited with {}: {}",
        output.status,
        truncate_error(&detail)
    )
}

fn truncate_error(value: &str) -> String {
    value.chars().take(4_000).collect()
}

#[tauri::command]
#[specta::specta]
pub async fn uninstall_language_server_package(
    app: tauri::AppHandle,
    state: tauri::State<'_, LanguageServerManagerState>,
    package_id: String,
) -> Result<(), String> {
    let package = registry_package(&package_id).map_err(|error| error.to_string())?;
    set_package_active(&state, &package_id)
        .await
        .map_err(|error| error.to_string())?;

    let result = async {
        let root = managed_root(&app)?;
        let directory = package_dir(&root, package);
        if directory.exists() {
            tokio::fs::remove_dir_all(directory).await?;
        }
        Ok::<(), anyhow::Error>(())
    }
    .await
    .map_err(|error| error.to_string());
    clear_package_active(&state, &package_id).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_valid_package_directory(directory: &Path, package: RegistryPackage) {
        let executable = PathBuf::from("bin/server");
        std::fs::create_dir_all(directory.join("bin")).unwrap();
        std::fs::write(directory.join(&executable), b"server").unwrap();
        if let Installer::Node {
            packages,
            server_script,
            ..
        } = package.installer
        {
            std::fs::create_dir_all(directory.join(server_script).parent().unwrap()).unwrap();
            std::fs::write(directory.join(server_script), b"server").unwrap();
            for artifact in packages {
                let required = directory
                    .join(artifact.destination)
                    .join(artifact.required_file);
                std::fs::create_dir_all(required.parent().unwrap()).unwrap();
                std::fs::write(required, b"package").unwrap();
            }
        }
        let manifest = InstallManifest {
            id: package.id.to_string(),
            version: package.version.to_string(),
            executable,
        };
        std::fs::write(
            directory.join(MANIFEST_FILE),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn registry_has_a_server_for_each_supported_programming_language() {
        let mut languages = vec![
            LanguageBase::Python,
            LanguageBase::TypeScript,
            LanguageBase::JavaScript,
            LanguageBase::Go,
        ];
        if clangd_artifact().is_some() {
            languages.push(LanguageBase::Cpp);
        }
        for language in languages {
            assert!(registry()
                .iter()
                .any(|package| package.languages.contains(&language)));
        }
    }

    #[test]
    fn generated_commands_use_the_managed_directory_placeholder() {
        for package in registry() {
            let manifest = InstallManifest {
                id: package.id.to_string(),
                version: package.version.to_string(),
                executable: PathBuf::from("bin/server"),
            };
            let command = launch_command(package, &manifest);
            assert!(command.contains(&format!("%{ENV_KEY_MANAGED_LSP}/")));
            assert!(!command.starts_with("node "));
        }
    }

    #[test]
    fn every_download_has_a_sha256_checksum() {
        let assert_artifact = |artifact: DownloadArtifact| {
            assert_eq!(artifact.sha256.len(), 64);
            assert!(artifact.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()));
            assert!(artifact.url.starts_with("https://"));
        };

        for package in registry() {
            match package.installer {
                Installer::Archive { artifact, .. } => assert_artifact(artifact),
                Installer::Node {
                    runtime, packages, ..
                } => {
                    assert_artifact(runtime);
                    packages
                        .iter()
                        .for_each(|package| assert_artifact(package.artifact));
                }
                Installer::ManagedGo { runtime, .. } => assert_artifact(runtime),
            }
        }
    }

    #[test]
    fn archive_paths_cannot_escape_the_install_directory() {
        assert!(strip_archive_path(Path::new("package/bin/server"), 1)
            .unwrap()
            .is_some());
        assert!(strip_archive_path(Path::new("package/../outside"), 1).is_err());
        assert!(strip_archive_path(Path::new("/outside"), 0).is_err());
    }

    #[test]
    fn unknown_packages_are_rejected() {
        assert!(registry_package("../../arbitrary-command").is_err());
    }

    #[test]
    fn interrupted_package_replacement_restores_valid_backup() {
        let root = std::env::temp_dir().join(format!(
            "algorimejo-lsp-recovery-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let package = registry().into_iter().next().unwrap();
        let backup = root.join(format!(".backup-{}-test", package.id));
        create_valid_package_directory(&backup, package);

        recover_package_backup(&root, package).unwrap();

        assert!(valid_package_directory(
            &package_dir(&root, package),
            package
        ));
        assert!(!backup.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stale_install_and_download_entries_are_removed() {
        let root = std::env::temp_dir().join(format!(
            "algorimejo-lsp-cleanup-test-{}",
            uuid::Uuid::new_v4()
        ));
        let install = root.join(".install-clangd-test");
        let download = root.join(".download-test");
        let unrelated = root.join("keep-me");
        std::fs::create_dir_all(&install).unwrap();
        std::fs::write(&download, b"partial").unwrap();
        std::fs::write(&unrelated, b"data").unwrap();

        cleanup_stale_installation_entries(&root).unwrap();

        assert!(!install.exists());
        assert!(!download.exists());
        assert!(unrelated.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn managed_node_runtime_discards_bundled_package_managers() {
        let directory = std::env::temp_dir().join(format!(
            "algorimejo-node-runtime-test-{}",
            uuid::Uuid::new_v4()
        ));
        let executable = Path::new("runtime/bin/node");
        tokio::fs::create_dir_all(directory.join("runtime/bin"))
            .await
            .unwrap();
        tokio::fs::create_dir_all(directory.join("runtime/node_modules/npm"))
            .await
            .unwrap();
        tokio::fs::write(directory.join(executable), b"node")
            .await
            .unwrap();
        tokio::fs::write(directory.join("runtime/bin/npm"), b"npm")
            .await
            .unwrap();

        retain_runtime_executable(&directory, executable)
            .await
            .unwrap();

        assert!(directory.join(executable).is_file());
        assert!(!directory.join("runtime/bin/npm").exists());
        assert!(!directory.join("runtime/node_modules").exists());
        tokio::fs::remove_dir_all(directory).await.unwrap();
    }
}
