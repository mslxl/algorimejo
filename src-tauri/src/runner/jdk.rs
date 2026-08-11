use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
};

use anyhow::{anyhow, bail, Context, Result};

use crate::runner::command_flag_hide_new_console;

pub const MINIMUM_JDTLS_JAVA_VERSION: u32 = 21;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JdkInfo {
    pub java: PathBuf,
    pub javac: PathBuf,
    pub major_version: u32,
}

fn java_executable_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

pub fn jdk_command_paths() -> (PathBuf, PathBuf) {
    if let Some(java_home) = env::var_os("JAVA_HOME").filter(|value| !value.is_empty()) {
        let bin = PathBuf::from(java_home).join("bin");
        let java = bin.join(java_executable_name("java"));
        let javac = bin.join(java_executable_name("javac"));
        if java.is_file() && javac.is_file() {
            return (java, javac);
        }
    }
    (
        PathBuf::from(java_executable_name("java")),
        PathBuf::from(java_executable_name("javac")),
    )
}

fn version_output(executable: &Path, argument: &str) -> Result<String> {
    let mut command = Command::new(executable);
    command.arg(argument);
    command_flag_hide_new_console(&mut command);
    let output = command
        .output()
        .with_context(|| format!("failed to run {}", executable.display()))?;
    if !output.status.success() {
        bail!("{} exited with {}", executable.display(), output.status);
    }
    Ok(format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn parse_java_major_version(output: &str) -> Option<u32> {
    let version = output
        .split(|character: char| character == '"' || character.is_whitespace())
        .find(|token| {
            token
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_digit())
        })?;
    let mut components = version.split('.');
    let first = components.next()?.parse::<u32>().ok()?;
    if first == 1 {
        components.next()?.parse().ok()
    } else {
        Some(first)
    }
}

fn inspect_jdk(java: PathBuf, javac: PathBuf) -> Result<JdkInfo> {
    let java_output = version_output(&java, "-version")?;
    let java_version = parse_java_major_version(&java_output)
        .ok_or_else(|| anyhow!("could not parse the version reported by {}", java.display()))?;
    let javac_output = version_output(&javac, "-version")?;
    let javac_version = parse_java_major_version(&javac_output).ok_or_else(|| {
        anyhow!(
            "could not parse the version reported by {}",
            javac.display()
        )
    })?;
    let major_version = java_version.min(javac_version);
    if major_version < MINIMUM_JDTLS_JAVA_VERSION {
        bail!(
            "JDT LS requires JDK {MINIMUM_JDTLS_JAVA_VERSION} or newer, but Java {major_version} was found"
        );
    }
    Ok(JdkInfo {
        java,
        javac,
        major_version,
    })
}

pub fn detect_jdk() -> Result<JdkInfo> {
    let mut candidates = Vec::new();
    if let Some(java_home) = env::var_os("JAVA_HOME").filter(|value| !value.is_empty()) {
        let bin = PathBuf::from(java_home).join("bin");
        candidates.push((
            bin.join(java_executable_name("java")),
            bin.join(java_executable_name("javac")),
            "JAVA_HOME",
        ));
    }
    candidates.push((
        PathBuf::from(java_executable_name("java")),
        PathBuf::from(java_executable_name("javac")),
        "PATH",
    ));

    let mut errors = Vec::new();
    for (java, javac, source) in candidates {
        match inspect_jdk(java, javac) {
            Ok(jdk) => return Ok(jdk),
            Err(error) => errors.push(format!("{source}: {error:#}")),
        }
    }

    bail!(
        "A full JDK {MINIMUM_JDTLS_JAVA_VERSION} or newer is required for Java and Eclipse JDT LS. Install a JDK and set JAVA_HOME or add java and javac to PATH. ({})",
        errors.join("; ")
    )
}

#[cfg(test)]
mod tests {
    use super::{java_executable_name, parse_java_major_version};

    #[test]
    fn parses_modern_openjdk_versions() {
        assert_eq!(
            parse_java_major_version("openjdk version \"21.0.7\" 2025-04-15 LTS"),
            Some(21)
        );
        assert_eq!(parse_java_major_version("javac 24.0.1"), Some(24));
    }

    #[test]
    fn parses_legacy_java_versions() {
        assert_eq!(
            parse_java_major_version("java version \"1.8.0_451\""),
            Some(8)
        );
    }

    #[test]
    fn uses_platform_java_executable_names() {
        assert_eq!(
            java_executable_name("java"),
            if cfg!(windows) { "java.exe" } else { "java" }
        );
    }
}
