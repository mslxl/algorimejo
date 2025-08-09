use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum LanguageBase {
    Cpp,
    TypeScript,
    Python,
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
    pub langauge: HashMap<String, AdvLanguageItem>,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        let mut language = HashMap::new();
        language.insert("Cpp".to_string(), AdvLanguageItem {
            base: LanguageBase::Cpp,
            cmd_compile: "g++ -std=c++17 -o $target".to_string(),
            cmd_before_run: None,
            cmd_after_run: None,
            cmd_run: "$target".to_string(),
            lsp: None,
            lsp_connect: None 
        });
        Self { langauge: language }
    }
}