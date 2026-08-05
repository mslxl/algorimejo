// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(exit_code) = algorimejo_lib::commands::terminal::run_pty_child_proxy() {
        std::process::exit(exit_code);
    }
    algorimejo_lib::run()
}
