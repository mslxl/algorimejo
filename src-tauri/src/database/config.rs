use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum LanguageBase {
    Cpp,
    TypeScript,
    JavaScript,
    Go,
    Python,
    Text,
}

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
}


#[derive(Debug, Clone, Serialize, Deserialize, Type)]

pub struct WorkspaceConfig {
    pub font_family: String,
    pub font_size: u32,
    pub language: HashMap<String, AdvLanguageItem>,
}

impl From<WorkspaceLocalDeserialized> for WorkspaceConfig {
    fn from(value: WorkspaceLocalDeserialized) -> Self {
        Self {
            font_family: value.font_family,
            font_size: value.font_size,
            language: value.language,
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
            "Cpp".to_string(),
            AdvLanguageItem {
                base: LanguageBase::Cpp,
                cmd_compile: "g++ -std=c++17 -o $target".to_string(),
                cmd_before_run: None,
                cmd_after_run: None,
                cmd_run: "$target".to_string(),
                lsp: None,
                lsp_connect: None,
            },
        );
        language
    }
}

impl Default for WorkspaceLocalDeserialized {
    fn default() -> Self {
        Self {
            language: Self::default_language(),
            font_family: Self::default_font_family(),
            font_size: Self::default_font_size(),
        }
    }
}
