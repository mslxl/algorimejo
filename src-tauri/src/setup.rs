use anyhow::Result;
use diesel::{
    r2d2::{ConnectionManager, Pool},
    SqliteConnection,
};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use log::{info, trace};
use tauri_plugin_decorum::WebviewWindowExt; 
use tauri::{Manager, Runtime};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

use crate::{
    config::ProgramConfig,
    database::{self, config::DatabaseConfig},
    document::DocumentRepo,
};

pub fn setup_database<R: Runtime>(app: &mut tauri::App<R>) -> Result<()> {
    trace!("setup database");
    let config = app.state::<ProgramConfig>();

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

    let pool = Pool::builder().build(manager)?;

    trace!("run pending migrations");
    pool.get()
        .unwrap()
        .run_pending_migrations(MIGRATIONS)
        .unwrap();

    let db_config_path = workspace.join("config.toml");
    let db_config = if !db_config_path.exists() {
        DatabaseConfig::default()
    } else {
        toml::from_str(&std::fs::read_to_string(db_config_path)?)?
    };

    let repository = database::DatabaseRepo::new(pool, workspace.clone(), db_config);

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

pub fn setup_program_config<R: Runtime>(app: &mut tauri::App<R>) -> Result<()> {
    trace!("setup program config");
    let config_path = app.path().app_data_dir()?.join("config.toml");
    let config_dir = config_path.parent().unwrap();

    if !config_dir.exists() {
        std::fs::create_dir_all(config_dir)?;
    }

    let cfg = ProgramConfig::load(config_path)?;
    app.manage(cfg);
    Ok(())
}


pub fn setup_decorum(app: &tauri::App) -> Result<()> {
    trace!("setup decorum");
    let main_window = app.get_webview_window("main").unwrap();
    main_window.create_overlay_titlebar().unwrap();

    // Some macOS-specific helpers
    #[cfg(target_os = "macos")] {
        // Set a custom inset to the traffic lights
        main_window.set_traffic_lights_inset(12.0, 16.0).unwrap();

        // Make window transparent without privateApi
        main_window.make_transparent().unwrap();

        // Set window level
        // NSWindowLevel: https://developer.apple.com/documentation/appkit/nswindowlevel
        main_window.set_window_level(25).unwrap()
    }

    Ok(())
}