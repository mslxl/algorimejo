use anyhow::Result;
use specta::Type;
use std::{
    path::PathBuf,
    sync::{RwLock, RwLockReadGuard, RwLockWriteGuard},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum Keymap {
    Default,
    Vim,
    Emacs,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum DetachedRunMode {
    EmbeddedTerminal,
    ExternalTerminal,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProgramConfig {
    pub workspace: Option<PathBuf>,
    pub theme: String,
    pub system_titlebar: bool,
    pub competitive_companion_addr: String,
    pub competitive_companion_enabled: bool,
    pub workspace_history: Vec<PathBuf>,
    pub keymap: Keymap,
    pub detached_run_mode: DetachedRunMode,
    pub wakatime_enabled: bool,
    pub wakatime_cli_path: String,
}

impl From<ProgramConfigLocalDeserialized> for ProgramConfig {
    fn from(value: ProgramConfigLocalDeserialized) -> Self {
        Self {
            workspace: value.workspace,
            theme: value.theme,
            system_titlebar: value.system_titlebar,
            competitive_companion_addr: value.competitive_companion_addr,
            competitive_companion_enabled: value.competitive_companion_enabled,
            workspace_history: value.workspace_history,
            keymap: value.keymap,
            detached_run_mode: value.detached_run_mode,
            wakatime_enabled: value.wakatime_enabled,
            wakatime_cli_path: value.wakatime_cli_path,
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

    #[serde(default = "ProgramConfigLocalDeserialized::default_competitive_companion_addr")]
    pub competitive_companion_addr: String,
    #[serde(default = "ProgramConfigLocalDeserialized::default_competitive_companion_enabled")]
    pub competitive_companion_enabled: bool,

    #[serde(default = "ProgramConfigLocalDeserialized::default_workspace_history")]
    pub workspace_history: Vec<PathBuf>,

    #[serde(default = "ProgramConfigLocalDeserialized::default_keymap")]
    pub keymap: Keymap,

    #[serde(default = "ProgramConfigLocalDeserialized::default_detached_run_mode")]
    pub detached_run_mode: DetachedRunMode,

    #[serde(default = "ProgramConfigLocalDeserialized::default_wakatime_enabled")]
    pub wakatime_enabled: bool,
    #[serde(default = "ProgramConfigLocalDeserialized::default_wakatime_cli_path")]
    pub wakatime_cli_path: String,
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
    fn default_competitive_companion_addr() -> String {
        "127.0.0.1:10043".to_string()
    }
    fn default_competitive_companion_enabled() -> bool {
        true
    }
    fn default_workspace_history() -> Vec<PathBuf> {
        vec![]
    }
    fn default_keymap() -> Keymap {
        Keymap::Default
    }
    fn default_detached_run_mode() -> DetachedRunMode {
        DetachedRunMode::EmbeddedTerminal
    }
    fn default_wakatime_enabled() -> bool {
        false
    }
    fn default_wakatime_cli_path() -> String {
        "wakatime-cli".to_string()
    }
}

impl Default for ProgramConfigLocalDeserialized {
    fn default() -> Self {
        Self {
            workspace: Self::default_workspace(),
            theme: Self::default_theme(),
            system_titlebar: Self::default_system_titlebar(),
            competitive_companion_addr: Self::default_competitive_companion_addr(),
            competitive_companion_enabled: Self::default_competitive_companion_enabled(),
            workspace_history: Self::default_workspace_history(),
            keymap: Self::default_keymap(),
            detached_run_mode: Self::default_detached_run_mode(),
            wakatime_enabled: Self::default_wakatime_enabled(),
            wakatime_cli_path: Self::default_wakatime_cli_path(),
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
            data: RwLock::new(ProgramConfig::from(
                ProgramConfigLocalDeserialized::default(),
            )),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_config_defaults_wakatime_to_disabled() {
        let config: ProgramConfigLocalDeserialized = toml::from_str("").unwrap();
        assert!(!config.wakatime_enabled);
        assert_eq!(config.wakatime_cli_path, "wakatime-cli");
    }
}
