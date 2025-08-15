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
pub struct DatabaseConfig {
    //TODO: Move the config item "theme" to program config
    #[serde(default = "DatabaseConfig::default_theme")]
    pub theme: String,
    #[serde(default = "DatabaseConfig::default_font_family")]
    pub font_family: String,
    #[serde(default = "DatabaseConfig::default_font_size")]
    pub font_size: u32,
    #[serde(default = "DatabaseConfig::default_language")]
    pub language: HashMap<String, AdvLanguageItem>,
}
impl DatabaseConfig {
    fn default_theme() -> String {
        "default".to_string()
    }
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

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            theme: Self::default_theme(),
            language: Self::default_language(),
            font_family: Self::default_font_family(),
            font_size: Self::default_font_size(),
        }
    }
}
