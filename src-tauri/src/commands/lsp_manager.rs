use std::{
    collections::HashSet,
    fs::File,
    io,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use tauri::Manager;
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

#[derive(Debug, Serialize, Deserialize)]
struct InstallManifest {
    id: String,
    version: String,
    executable: PathBuf,
}

fn clangd_artifact() -> Option<DownloadArtifact> {
    if cfg!(target_os = "windows") {
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
                        artifact: DownloadArtifact {
                            url: "https://registry.npmjs.org/typescript-language-server/-/typescript-language-server-4.3.4.tgz",
                            sha256: "9a8aef1dd532f9b4b38087b002b949d9e761ab31fe1dc2f0bfe43ac223150385",
                            format: ArchiveFormat::TarGz,
                        },
                        destination: "node_modules/typescript-language-server",
                        required_file: "lib/cli.mjs",
                    },
                    NodePackageArtifact {
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

fn package_dir(root: &Path, package: RegistryPackage) -> PathBuf {
    root.join(package.id)
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
    let valid_manifest = manifest.filter(|manifest| {
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
    });

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
) -> Result<LanguageServerPackage, String> {
    let package = registry_package(&package_id).map_err(|error| error.to_string())?;
    set_package_active(&state, &package_id)
        .await
        .map_err(|error| error.to_string())?;

    let root = managed_root(&app).map_err(|error| error.to_string());
    let result = match root {
        Ok(root) => install_package(&root, package)
            .await
            .map(|_| root)
            .map_err(|error| error.to_string()),
        Err(error) => Err(error),
    };
    clear_package_active(&state, &package_id).await;

    let root = result?;
    Ok(package_status(&root, package).await)
}

async fn install_package(root: &Path, package: RegistryPackage) -> Result<()> {
    tokio::fs::create_dir_all(root).await?;
    let temporary = root.join(format!(".install-{}-{}", package.id, uuid::Uuid::new_v4()));
    tokio::fs::create_dir(&temporary).await?;

    let result = async {
        let executable = install_into(&temporary, package).await?;
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

async fn install_into(directory: &Path, package: RegistryPackage) -> Result<PathBuf> {
    match package.installer {
        Installer::Archive {
            artifact,
            executable_name,
        } => install_archive(directory, artifact, executable_name).await,
        Installer::Node {
            runtime,
            runtime_executable,
            packages,
            ..
        } => install_node_server(directory, runtime, runtime_executable, packages).await,
        Installer::ManagedGo {
            runtime,
            runtime_executable,
            package,
            executable,
        } => install_managed_go(directory, runtime, runtime_executable, package, executable).await,
    }
}

async fn install_archive(
    directory: &Path,
    artifact: DownloadArtifact,
    executable_name: &str,
) -> Result<PathBuf> {
    download_and_extract(directory, artifact, 0).await?;
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
) -> Result<PathBuf> {
    download_and_extract(&directory.join("runtime"), runtime, 1).await?;
    let runtime_executable = PathBuf::from(runtime_executable);
    retain_runtime_executable(directory, &runtime_executable).await?;

    for package in packages {
        let destination = directory.join(package.destination);
        download_and_extract(&destination, package.artifact, 1).await?;
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
) -> Result<PathBuf> {
    let toolchain = directory.join(".toolchain");
    download_and_extract(&toolchain, runtime, 1).await?;

    let binary_dir = directory.join("bin");
    let gopath = directory.join(".gopath");
    let cache = directory.join(".gocache");
    let module_cache = directory.join(".gomodcache");
    tokio::fs::create_dir_all(&binary_dir).await?;

    let mut command = Command::new(directory.join(runtime_executable));
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
) -> Result<()> {
    tokio::fs::create_dir_all(destination).await?;
    let archive_path = destination
        .parent()
        .unwrap_or(destination)
        .join(format!(".download-{}", uuid::Uuid::new_v4()));
    download_artifact(&archive_path, artifact).await?;

    let archive_for_extract = archive_path.clone();
    let destination = destination.to_path_buf();
    let extract_result = tokio::task::spawn_blocking(move || match artifact.format {
        ArchiveFormat::Zip => extract_zip(&archive_for_extract, &destination, strip_components),
        ArchiveFormat::TarGz => {
            extract_tar_gz(&archive_for_extract, &destination, strip_components)
        }
    })
    .await?;
    let remove_result = tokio::fs::remove_file(&archive_path).await;
    extract_result?;
    remove_result?;
    Ok(())
}

async fn download_artifact(path: &Path, artifact: DownloadArtifact) -> Result<()> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("Algorimejo/", env!("CARGO_PKG_VERSION")))
        .build()?;
    let mut response = client.get(artifact.url).send().await?.error_for_status()?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_DOWNLOAD_SIZE)
    {
        bail!("Language server archive exceeds the download limit");
    }

    let mut downloaded = 0_u64;
    let mut hasher = Sha256::new();
    let mut archive_file = tokio::fs::File::create(path).await?;
    while let Some(chunk) = response.chunk().await? {
        downloaded += chunk.len() as u64;
        if downloaded > MAX_DOWNLOAD_SIZE {
            bail!("Language server archive exceeds the download limit");
        }
        hasher.update(&chunk);
        archive_file.write_all(&chunk).await?;
    }
    archive_file.flush().await?;
    drop(archive_file);

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

    #[test]
    fn registry_has_a_server_for_each_supported_programming_language() {
        for language in [
            LanguageBase::Cpp,
            LanguageBase::Python,
            LanguageBase::TypeScript,
            LanguageBase::JavaScript,
            LanguageBase::Go,
        ] {
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
