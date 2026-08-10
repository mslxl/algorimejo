use anyhow::Result;
use diesel::{
    r2d2::{ConnectionManager, Pool},
    r2d2::{CustomizeConnection, Error as PoolError},
    RunQueryDsl, SqliteConnection,
};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use log::{error, info, trace};
use tauri::{async_runtime::block_on, Manager, Runtime};
use tauri_plugin_decorum::WebviewWindowExt;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

#[derive(Debug)]
struct SqliteConnectionCustomizer;

impl CustomizeConnection<SqliteConnection, PoolError> for SqliteConnectionCustomizer {
    fn on_acquire(&self, connection: &mut SqliteConnection) -> Result<(), PoolError> {
        diesel::sql_query("PRAGMA foreign_keys = ON")
            .execute(connection)
            .map_err(PoolError::QueryError)?;
        diesel::sql_query("PRAGMA busy_timeout = 5000")
            .execute(connection)
            .map_err(PoolError::QueryError)?;
        Ok(())
    }
}

use crate::{
    commands::database::{
        launch_competitive_companion_listener, CompetitiveCompanionListenerState,
    },
    config::ProgramConfigRepo,
    database::{self, config::WorkspaceLocalDeserialized},
    document::DocumentRepo,
    runner::BUNDLED_CHECKER_NAME,
};

pub fn setup_database<R: Runtime>(app: &mut tauri::App<R>) -> Result<()> {
    trace!("setup database");
    let config = app.state::<ProgramConfigRepo>();

    let mut writer = config.write()?;
    let mut is_config_modified = false;

    // set workspace if not set
    if writer.workspace.is_none() {
        let workspace = app
            .path()
            .app_local_data_dir()?
            .join("workspace")
            .join(whoami::username());

        writer.workspace = Some(workspace);
        is_config_modified = true;
    }

    let workspace = writer.workspace.as_ref().unwrap();

    if !workspace.exists() {
        std::fs::create_dir_all(workspace)?;
    }

    let database_path = workspace
        .join("database.sqlite")
        .to_str()
        .unwrap()
        .to_string();

    info!("open database {}", &database_path);

    let manager = ConnectionManager::<SqliteConnection>::new(database_path);

    let pool = Pool::builder()
        .connection_customizer(Box::new(SqliteConnectionCustomizer))
        .build(manager)?;

    trace!("run pending migrations");
    pool.get()
        .unwrap()
        .run_pending_migrations(MIGRATIONS)
        .unwrap();

    let db_config_path = workspace.join("config.toml");
    let db_config = if !db_config_path.exists() {
        WorkspaceLocalDeserialized::default()
    } else {
        toml::from_str::<WorkspaceLocalDeserialized>(&std::fs::read_to_string(db_config_path)?)?
    };

    let repository = database::DatabaseRepo::new(pool, workspace.clone(), db_config.into());
    repository.seed_builtin_checkers(&BUNDLED_CHECKER_NAME)?;

    app.manage(repository);

    std::mem::drop(writer);
    if is_config_modified {
        config.save()?;
    }

    Ok(())
}

pub fn setup_document_repo<R: Runtime>(app: &mut tauri::App<R>) -> Result<()> {
    trace!("setup document repo");
    let repo = DocumentRepo::new();
    app.manage(repo);
    Ok(())
}

pub fn setup_program_config(app: &mut tauri::App) -> Result<()> {
    trace!("setup program config");
    let config_path = app.path().app_data_dir()?.join("config.toml");
    let config_dir = config_path.parent().unwrap();

    if !config_dir.exists() {
        std::fs::create_dir_all(config_dir)?;
    }

    let cfg = ProgramConfigRepo::load(config_path)?;

    app.manage(cfg);
    Ok(())
}

pub fn setup_competitive_companion_listener(app: &mut tauri::App) -> Result<()> {
    app.manage(CompetitiveCompanionListenerState::default());
    let cfg = app.state::<ProgramConfigRepo>();
    let cfg_guard = cfg.read()?;
    if cfg_guard.competitive_companion_enabled {
        if let Err(listener_error) = block_on(launch_competitive_companion_listener(
            app.handle().clone(),
            cfg_guard.competitive_companion_addr.clone(),
        )) {
            error!("failed to start Competitive Companion listener at startup: {listener_error}");
        }
    }
    Ok(())
}

pub fn setup_decorum(app: &tauri::App) -> Result<()> {
    let cfg = app.state::<ProgramConfigRepo>();
    let cfg_guard = cfg.read()?;
    if cfg_guard.system_titlebar {
        return Ok(());
    }
    trace!("setup decorum");
    let main_window = app.get_webview_window("main").unwrap();
    main_window.create_overlay_titlebar().unwrap();

    // Some macOS-specific helpers
    #[cfg(target_os = "macos")]
    {
        // Set a custom inset to the traffic lights
        main_window.set_traffic_lights_inset(12.0, 16.0).unwrap();

        // Make window transparent without privateApi
        main_window.make_transparent().unwrap();

        // Set window level
        // NSWindowLevel: https://developer.apple.com/documentation/appkit/nswindowlevel
        main_window.set_window_level(25).unwrap();
    }

    Ok(())
}
