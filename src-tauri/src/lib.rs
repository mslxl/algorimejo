#[cfg(debug_assertions)]
use specta_typescript::{formatter, BigIntExportBehavior};
use tauri::{async_runtime::block_on, Manager, RunEvent};
use tauri_specta::{collect_commands, collect_events, Builder};
use tokio::task::block_in_place;

use crate::commands::database::shutdown_competitive_companion_listener;

pub mod commands;
pub mod config;
pub mod database;
pub mod document;
pub mod model;
pub mod runner;
pub mod schema;
pub mod setup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .events(collect_events![
            commands::QueryClientInvalidateEvent,
            commands::ToastEvent,
            commands::ProgramConfigUpdateEvent,
            commands::database::WorkspaceConfigUpdateEvent,
            commands::runner::LanguageServerEvent,
            commands::runner::ProgramOutputEvent,
        ])
        .commands(collect_commands![
            commands::exit_app::<tauri::Wry>,
            commands::get_prog_config,
            commands::set_prog_config::<tauri::Wry>,
            commands::get_default_create_problem_params,
            commands::get_default_create_solution_params,
            commands::database::get_problems,
            commands::database::get_problem,
            commands::database::create_problem,
            commands::database::create_solution,
            commands::database::create_checker,
            commands::database::get_solution,
            commands::database::delete_problem,
            commands::database::delete_solution,
            commands::database::update_problem,
            commands::database::update_solution,
            commands::database::create_testcase,
            commands::database::delete_testcase,
            commands::database::get_testcases,
            commands::database::get_workspace_config,
            commands::database::set_workspace_config::<tauri::Wry>,
            commands::database::get_string_of_doc,
            commands::database::launch_competitive_companion_listener,
            commands::database::shutdown_competitive_companion_listener,
            // TODO: cataloging
            commands::database::load_document,
            commands::database::apply_change,
            commands::database::resolve_checker,
            commands::runner::get_checkers_name,
            commands::runner::launch_language_server,
            commands::runner::kill_language_server,
            commands::runner::send_message_to_language_server,
            commands::runner::execute_program_callback,
            commands::runner::write_file_to_task_tag,
            commands::runner::execute_program
        ]);

    #[cfg(debug_assertions)]
    {
        use specta_typescript::Typescript;
        builder
            .export(
                Typescript::default()
                    // https://github.com/specta-rs/tauri-specta/issues/179
                    // Sadly, we have to use number instead of string, because using string need lot work
                    // we need number to provide temporary solution for the issue
                    .bigint(BigIntExportBehavior::Number)
                    .formatter(formatter::eslint),
                "../src/lib/client/local.ts",
            )
            .expect("failed to export typescript bindings");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            setup::setup_program_config(app)?;
            setup::setup_database(app)?;
            setup::setup_document_repo(app)?;
            setup::setup_decorum(app)?;
            setup::setup_competitive_companion_listener(app)?;

            app.manage(commands::runner::LangServerState::default());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|handle, event| match event {
            RunEvent::Exit => {
                let state = handle.state::<commands::runner::LangServerState>();
                log::trace!("Recycling external resources");
                block_in_place(|| {
                    block_on(async {
                        // ignore the result
                        // the program nearly exit, so we don't need to deal for the result
                        let _ = tokio::join!(
                            state.kill_all(),
                            shutdown_competitive_companion_listener(handle.clone())
                        );
                    });
                });
            }
            _ => {}
        });
}
