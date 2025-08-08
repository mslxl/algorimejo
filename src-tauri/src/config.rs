use anyhow::Result;
use specta::Type;
use std::{
    path::PathBuf,
    sync::{RwLock, RwLockReadGuard, RwLockWriteGuard},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
pub struct ProgramConfigData {
    pub workspace: Option<PathBuf>,
}

#[derive(Debug)]
pub struct ProgramConfig {
    path: PathBuf,
    data: RwLock<ProgramConfigData>,
}

impl ProgramConfig {
    pub fn load(path: PathBuf) -> Result<Self> {
        let mut instance = Self {
            path,
            data: RwLock::new(ProgramConfigData::default()),
        };
        instance.reload()?;
        Ok(instance)
    }
    pub fn reload(&mut self) -> Result<()> {
        if self.path.exists() {
            let data = toml::from_str(&std::fs::read_to_string(&self.path)?)?;
            let mut guard = self.data.write().unwrap();
            *guard = data;
        }
        Ok(())
    }
    pub fn save(&self) -> Result<()> {
        let data = self.data.read().unwrap();
        let serialized = toml::to_string(&*data)?;
        std::fs::write(self.path.clone(), serialized)?;
        Ok(())
    }

    pub fn read(&self) -> Result<RwLockReadGuard<'_, ProgramConfigData>> {
        Ok(self.data.read().unwrap())
    }
    pub fn write(&self) -> Result<RwLockWriteGuard<'_, ProgramConfigData>> {
        Ok(self.data.write().unwrap())
    }
}
