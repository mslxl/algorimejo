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
            commands::lsp_manager::LanguageServerInstallProgressEvent,
            commands::runner::LanguageServerEvent,
            commands::runner::ProgramOutputEvent,
            commands::terminal::PtyProcessEvent,
        ])
        .commands(collect_commands![
            commands::exit_app::<tauri::Wry>,
            commands::get_prog_config,
            commands::set_prog_config::<tauri::Wry>,
            commands::wakatime::check_wakatime_cli,
            commands::wakatime::send_wakatime_heartbeat,
            commands::get_default_create_problem_params,
            commands::get_default_create_solution_params,
            commands::database::get_problems,
            commands::database::get_problem,
            commands::database::create_problem,
            commands::database::create_solution,
            commands::database::create_checker,
            commands::database::get_checker,
            commands::database::get_visible_checkers,
            commands::database::update_checker,
            commands::database::delete_checker,
            commands::database::get_checker_usages,
            commands::database::set_problem_checker,
            commands::database::get_checker_self_tests,
            commands::database::upsert_checker_self_test,
            commands::database::delete_checker_self_test,
            commands::checker::get_checker_sdk_info,
            commands::checker::get_checker_editor_info,
            commands::checker::build_checker,
            commands::checker::execute_checker,
            commands::checker::run_checker_self_test,
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
            commands::database::load_document,
            commands::database::apply_change,
            commands::database::save_duplicated_file,
            commands::runner::get_checkers_name,
            commands::runner::launch_language_server,
            commands::runner::kill_language_server,
            commands::runner::kill_all_language_servers,
            commands::runner::send_message_to_language_server,
            commands::lsp_manager::list_language_server_packages,
            commands::lsp_manager::install_language_server_package,
            commands::lsp_manager::uninstall_language_server_package,
            commands::runner::execute_program_callback,
            commands::runner::write_file_to_task_tag,
            commands::runner::execute_program,
            commands::runner::execute_program_detached,
            commands::terminal::launch_pty_session,
            commands::terminal::write_pty_session,
            commands::terminal::resize_pty_session,
            commands::terminal::kill_pty_session
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: None },
                ))
                .max_file_size(50_000)
                .filter(|metadata| {
                    !metadata
                        .target()
                        .starts_with("tao::platform_impl::platform")
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_decorum::init())
        .manage(commands::checker::CheckerBuildState::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            setup::setup_program_config(app)?;
            setup::setup_database(app)?;
            setup::setup_document_repo(app)?;
            setup::setup_decorum(app)?;
            setup::setup_competitive_companion_listener(app)?;
            if let Err(error) =
                commands::lsp_manager::recover_managed_language_servers(app.handle())
            {
                log::warn!("failed to recover managed language server installations: {error}");
            }

            app.manage(commands::runner::LangServerState::default());
            app.manage(commands::terminal::PtySessionState::default());
            app.manage(commands::lsp_manager::LanguageServerManagerState::default());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|handle, event| match event {
            RunEvent::Exit => {
                let state = handle.state::<commands::runner::LangServerState>();
                let pty_state = handle.state::<commands::terminal::PtySessionState>();
                log::trace!("Recycling external resources");
                pty_state.kill_all();
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
