#[cfg(debug_assertions)]
use specta_typescript::formatter;
use specta_typescript::Typescript;
use tauri::Manager;
use tauri_plugin_decorum::WebviewWindowExt;
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
            commands::WorkspaceConfigUpdateEvent,
        ])
        .commands(collect_commands![
            commands::exit_app::<tauri::Wry>,
            commands::get_problems,
            commands::get_problem,
            commands::create_problem,
            commands::create_solution,
            commands::create_checker,
            commands::get_solution,
            commands::delete_problem,
            commands::delete_solution,
            commands::update_problem,
            commands::update_solution,
            commands::create_testcase,
            commands::delete_testcase,
            commands::get_testcases,
            commands::get_prog_config,
            commands::set_prog_config::<tauri::Wry>,
            commands::get_workspace_config,
            commands::set_workspace_config::<tauri::Wry>,
            // TODO: cataloging
            commands::load_document,
            commands::apply_change,
            commands::get_checkers_name,
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


            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
