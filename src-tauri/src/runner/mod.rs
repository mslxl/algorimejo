use std::{ffi::OsStr, fs, path::PathBuf, process::Command};

use log::trace;
use once_cell::sync::Lazy;

pub mod checker_sdk;
pub mod cmd;
pub mod jdk;
pub mod lang_server;
pub mod run;

pub static BUNDLED_CHECKER_NAME: Lazy<Vec<&str>> = Lazy::new(|| {
    let chks = include_str!("bundle-chk.txt").lines().collect::<Vec<_>>();
    trace!("Bundled checker names: {:?}", &chks);
    chks
});

pub fn get_bundled_checker_names() -> &'static [&'static str] {
    &BUNDLED_CHECKER_NAME.as_ref()
}

// The process is a console application that is being run without a console window. Therefore, the console handle for the application is not set.
pub const CREATE_NO_WINDOW: u32 = 0x08000000;
// For console processes, the new process does not inherit its parent's console (the default). The new process can call the AllocConsole function at a later time to create a console. For more information, see Creation of a Console. This value cannot be used with CREATE_NEW_CONSOLE.
pub const DETACHED_PROCESS: u32 = 0x00000008;
// The new process has a new console, instead of inheriting its parent's console (the default). For more information, see Creation of a Console.
pub const CREATE_NEW_CONSOLE: u32 = 0x00000010;

pub fn command_flag_hide_new_console(_command: &mut Command) {
    #[cfg(all(debug_assertions, windows))]
    {
        use std::os::windows::process::CommandExt;
        _command.creation_flags(DETACHED_PROCESS);
    }
    #[cfg(all(not(debug_assertions), windows))]
    {
        use std::os::windows::process::CommandExt;
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}

pub fn command_flag_create_new_console(_command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        _command.creation_flags(CREATE_NEW_CONSOLE);
        trace!("add flag {}", CREATE_NEW_CONSOLE);
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub fn launch_command_in_terminal(command: &Command) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return launch_command_in_macos_terminal(command);

    #[cfg(target_os = "linux")]
    {
        // TODO: Test these fallbacks across Linux desktop environments and make the terminal configurable.
        const TERMINALS: &[(&str, &[&str])] = &[
            ("x-terminal-emulator", &["-e"]),
            ("gnome-terminal", &["--"]),
            ("kgx", &["--"]),
            ("konsole", &["-e"]),
            ("xfce4-terminal", &["-x"]),
            ("mate-terminal", &["-x"]),
            ("alacritty", &["-e"]),
            ("kitty", &[]),
            ("wezterm", &["start", "--"]),
            ("xterm", &["-e"]),
        ];

        let mut errors = Vec::new();
        for (terminal, terminal_args) in TERMINALS {
            let mut terminal_command = Command::new(terminal);
            terminal_command
                .args(*terminal_args)
                .arg(command.get_program())
                .args(command.get_args());

            if let Some(current_dir) = command.get_current_dir() {
                terminal_command.current_dir(current_dir);
            }

            trace!(
                "launch detached program in terminal: {:?}",
                &terminal_command
            );
            match terminal_command.spawn() {
                Ok(_) => return Ok(()),
                Err(error) => errors.push(format!("{terminal}: {error}")),
            }
        }

        Err(format!(
            "No supported terminal emulator could be started. Tried: {}",
            errors.join("; ")
        ))
    }
}

#[cfg(target_os = "macos")]
fn shell_quote(value: &OsStr) -> Result<String, String> {
    let value = value.to_str().ok_or_else(|| {
        "External Terminal does not support non-UTF-8 command arguments".to_string()
    })?;
    Ok(format!("'{}'", value.replace('\'', "'\\''")))
}

#[cfg(target_os = "macos")]
fn launch_command_in_macos_terminal(command: &Command) -> Result<(), String> {
    // Terminal.app accepts an executable .command file, which preserves argument boundaries.
    let current_dir = command
        .get_current_dir()
        .ok_or_else(|| "External Terminal command has no working directory".to_string())?;
    let script_path = current_dir.join(format!(".algorimejo-{}.command", uuid::Uuid::new_v4()));
    let mut script = String::from("#!/bin/zsh\nset -u\nrm -f -- \"$0\"\ncd -- ");
    script.push_str(&shell_quote(current_dir.as_os_str())?);
    script.push_str("\nexec ");
    script.push_str(&shell_quote(command.get_program())?);
    for argument in command.get_args() {
        script.push(' ');
        script.push_str(&shell_quote(argument)?);
    }
    script.push('\n');

    fs::write(&script_path, script).map_err(|error| error.to_string())?;
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;

    let result = Command::new("/usr/bin/open")
        .args(["-a", "Terminal"])
        .arg(&script_path)
        .status();
    match result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => {
            let _ = fs::remove_file(&script_path);
            Err(format!("failed to open Terminal.app: {status}"))
        }
        Err(error) => {
            let _ = fs::remove_file(&script_path);
            Err(format!("failed to open Terminal.app: {error}"))
        }
    }
}

pub fn temp_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("algorime-{}", name))
}
