use specta_typescript::Typescript;
#[cfg(debug_assertions)]
use specta_typescript::{formatter, BigIntExportBehavior, FormatterFn};
use tauri_specta::{collect_commands, Builder};

pub mod commands;
pub mod config;
pub mod database;
pub mod model;
pub mod schema;
pub mod setup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .commands(collect_commands![
            commands::get_problems,
            commands::create_problem,
            commands::create_solution,
            commands::create_checker,
            commands::delete_problem,
            commands::delete_solution,
            commands::update_problem,
            commands::update_solution,
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(
            Typescript::default()
                // .bigint(BigIntExportBehavior::BigInt)
                .formatter(formatter::biome),
            "../src/lib/client.ts",
        )
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            setup::setup_program_config(app)?;
            setup::setup_database(app)?;
            builder.mount_events(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
