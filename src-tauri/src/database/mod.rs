use std::path::PathBuf;

use diesel::{
    r2d2::{ConnectionManager, Pool},
    SqliteConnection,
};

pub struct DatabaseRepo {
    pool: Pool<ConnectionManager<SqliteConnection>>,
    base_folder: PathBuf,
}

impl DatabaseRepo {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>, base_folder: PathBuf) -> Self {
        Self { pool, base_folder }
    }
}
