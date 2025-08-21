use anyhow::Result;
use specta::Type;
use std::{
    path::PathBuf,
    sync::{RwLock, RwLockReadGuard, RwLockWriteGuard},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
pub struct ProgramConfig {
    pub workspace: Option<PathBuf>,
    pub theme: String,
    pub system_titlebar: bool,
}

impl From<ProgramConfigLocalDeserialized> for ProgramConfig {
    fn from(value: ProgramConfigLocalDeserialized) -> Self {
        Self {
            workspace: value.workspace,
            theme: value.theme,
            system_titlebar: value.system_titlebar,
        }
    }
}

// This struct is used to deserialize the program config from the local file
// DO NOT use it to communicate with the tauri page, the type is not right with specta. use ProgramConfigData instead.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramConfigLocalDeserialized {
    #[serde(default = "ProgramConfigLocalDeserialized::default_workspace")]
    pub workspace: Option<PathBuf>,
    #[serde(default = "ProgramConfigLocalDeserialized::default_theme")]
    pub theme: String,
    #[serde(default = "ProgramConfigLocalDeserialized::default_system_titlebar")]
    pub system_titlebar: bool,
}

impl ProgramConfigLocalDeserialized {
    fn default_workspace() -> Option<PathBuf> {
        None
    }
    fn default_theme() -> String {
        "default".to_string()
    }
    fn default_system_titlebar() -> bool {
        false
    }
}

impl Default for ProgramConfigLocalDeserialized {
    fn default() -> Self {
        Self {
            workspace: Self::default_workspace(),
            theme: Self::default_theme(),
            system_titlebar: Self::default_system_titlebar(),
        }
    }
}

#[derive(Debug)]
pub struct ProgramConfigRepo {
    path: PathBuf,
    data: RwLock<ProgramConfig>,
}
impl ProgramConfigRepo {
    pub fn load(path: PathBuf) -> Result<Self> {
        let mut instance = Self {
            path,
            data: RwLock::new(ProgramConfig::default()),
        };
        instance.reload()?;
        Ok(instance)
    }
    pub fn reload(&mut self) -> Result<()> {
        if self.path.exists() {
            let data = toml::from_str::<ProgramConfigLocalDeserialized>(&std::fs::read_to_string(
                &self.path,
            )?)?;
            let mut guard = self.data.write().unwrap();
            *guard = data.into();
        }
        Ok(())
    }
    pub fn save(&self) -> Result<()> {
        let data = self.data.read().unwrap();
        let serialized = toml::to_string(&*data)?;
        std::fs::write(self.path.clone(), serialized)?;
        Ok(())
    }

    pub fn read(&self) -> Result<RwLockReadGuard<'_, ProgramConfig>> {
        Ok(self.data.read().unwrap())
    }
    pub fn write(&self) -> Result<RwLockWriteGuard<'_, ProgramConfig>> {
        Ok(self.data.write().unwrap())
    }
}
