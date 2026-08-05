use std::{path::PathBuf, process::Command};

use log::trace;
use once_cell::sync::Lazy;

pub mod checker_sdk;
pub mod cmd;
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

pub fn command_flag_hide_new_console(command: &mut Command) {
    #[cfg(all(debug_assertions, windows))]
    {
        use std::os::windows::process::CommandExt;
        // command.creation_flags(CREATE_NEW_CONSOLE);
        command.creation_flags(DETACHED_PROCESS);
    }
    #[cfg(all(not(debug_assertions), windows))]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

pub fn command_flag_create_new_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NEW_CONSOLE);
        trace!("add flag {}", CREATE_NEW_CONSOLE);
    }
}

#[cfg(target_os = "linux")]
pub fn launch_command_in_terminal(command: &Command) -> Result<(), String> {
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

        trace!("launch detached program in terminal: {:?}", &terminal_command);
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

pub fn temp_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("algorime-{}", name))
}
