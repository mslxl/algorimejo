#[cfg(debug_assertions)]
use specta_typescript::formatter;
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_specta::{collect_commands, collect_events, Builder};

pub mod commands;
pub mod config;
pub mod database;
pub mod document;
pub mod model;
pub mod schema;
pub mod setup;
pub mod runner;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .events(collect_events![
            commands::ProgramConfigUpdateEvent,
            commands::database::WorkspaceConfigUpdateEvent,
            commands::runner::LanguageServerResponseEvent,
        ])
        .commands(collect_commands![
            commands::exit_app::<tauri::Wry>,
            commands::get_prog_config,
            commands::set_prog_config::<tauri::Wry>,
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
            // TODO: cataloging
            commands::database::load_document,
            commands::database::apply_change,
            commands::runner::get_checkers_name,
            commands::runner::launch_language_server,
            commands::runner::kill_language_server,
            commands::runner::send_message_to_language_server,
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(
            Typescript::default()
                // .bigint(BigIntExportBehavior::BigInt)
                .formatter(formatter::biome),
            "../src/lib/client/local.ts",
        )
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
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
            
            app.manage(commands::runner::LangServerState::default());


            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
