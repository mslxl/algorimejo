use anyhow::Result;
use diesel::{
    r2d2::{ConnectionManager, Pool},
    SqliteConnection,
};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use log::{info, trace};
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");
use tauri::{Manager, Runtime};

use crate::{config::ProgramConfig, database};

pub fn setup_database<R: Runtime>(app: &mut tauri::App<R>) -> Result<()> {
    trace!("setup database");
    let config = app.state::<ProgramConfig>();

    let mut writer = config.write()?;
    let mut is_config_modified = false;

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

    let repository = database::DatabaseRepo::new(pool, workspace.clone());

    app.manage(repository);

    std::mem::drop(writer);
    if is_config_modified {
        config.save()?;
    }

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
