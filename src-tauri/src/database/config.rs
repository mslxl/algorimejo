use std::{
    collections::HashMap,
    path::{self, PathBuf},
};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{commands::runner::ENV_KEY_BUNDLED_LSP, database::language::LanguageBase};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum LanguageServerProtocolConnectionType {
    StdIO,
    WebSocket,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]

pub struct AdvLanguageItem {
    pub base: LanguageBase,
    pub cmd_compile: String,
    pub cmd_before_run: Option<String>,
    pub cmd_after_run: Option<String>,
    pub cmd_run: String,
    pub lsp: Option<String>,
    pub lsp_connect: Option<LanguageServerProtocolConnectionType>,
    pub initial_solution_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]

pub struct WorkspaceConfig {
    pub font_family: String,
    pub font_size: u32,
    pub language: HashMap<String, AdvLanguageItem>,
    pub default_language: Option<String>,
    pub duplicate_save: bool,
    pub duplicate_save_location: Option<PathBuf>,
}

impl From<WorkspaceLocalDeserialized> for WorkspaceConfig {
    fn from(value: WorkspaceLocalDeserialized) -> Self {
        Self {
            font_family: value.font_family,
            font_size: value.font_size,
            language: value.language,
            default_language: value.default_language,
            duplicate_save: value.duplicate_save,
            duplicate_save_location: value.duplicate_save_location,
        }
    }
}

// This struct is used to deserialize the database config from the local file
// DO NOT use it to communicate with the tauri page, the type is not right with specta. use WorkspaceConfig instead.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLocalDeserialized {
    #[serde(default = "WorkspaceLocalDeserialized::default_font_family")]
    pub font_family: String,
    #[serde(default = "WorkspaceLocalDeserialized::default_font_size")]
    pub font_size: u32,
    #[serde(default = "WorkspaceLocalDeserialized::default_language")]
    pub language: HashMap<String, AdvLanguageItem>,
    pub default_language: Option<String>,
    #[serde(default = "WorkspaceLocalDeserialized::default_duplicate_save")]
    pub duplicate_save: bool,
    #[serde(default = "WorkspaceLocalDeserialized::default_duplicate_save_location")]
    pub duplicate_save_location: Option<PathBuf>,
}
impl WorkspaceLocalDeserialized {
    fn default_font_size() -> u32 {
        14
    }
    fn default_font_family() -> String {
        "\"JetBrains Mono\", Consolas, 'Courier New', monospace".to_string()
    }
    fn default_language() -> HashMap<String, AdvLanguageItem> {
        let mut language = HashMap::new();
        language.insert(
            "cpp 17".to_string(),
            AdvLanguageItem {
                base: LanguageBase::Cpp,
                cmd_compile: "g++ -std=c++17 -o main %SRC".to_string(),
                cmd_before_run: None,
                cmd_after_run: None,
                cmd_run: format!(
                    "%CWD{}main{}",
                    path::MAIN_SEPARATOR,
                    if cfg!(target_os = "windows") {
                        ".exe"
                    } else {
                        ""
                    }
                ),
                lsp: Some(format!(
                    "%{}{}clangd{}",
                    ENV_KEY_BUNDLED_LSP,
                    path::MAIN_SEPARATOR,
                    if cfg!(target_os = "windows") {
                        ".exe"
                    } else {
                        ""
                    }
                )),
                lsp_connect: Some(LanguageServerProtocolConnectionType::StdIO),
                initial_solution_content: Some(
                    "#include<iostream>\nint main(){\n\treturn 0;\n}".to_string(),
                ),
            },
        );
        language
    }
    fn default_duplicate_save() -> bool {
        false
    }
    fn default_duplicate_save_location() -> Option<PathBuf> {
        None
    }
}

impl Default for WorkspaceLocalDeserialized {
    fn default() -> Self {
        Self {
            language: Self::default_language(),
            font_family: Self::default_font_family(),
            font_size: Self::default_font_size(),
            default_language: None,
            duplicate_save: Self::default_duplicate_save(),
            duplicate_save_location: Self::default_duplicate_save_location(),
        }
    }
}
