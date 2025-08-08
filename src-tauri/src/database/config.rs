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
    pub cmd_before_run: String,
    pub cmd_after_run: String,
    pub cmd_run: String,
    pub lsp: String,
    pub lsp_connect: LanguageServerProtocolConnectionType,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
pub struct DatabaseConfig {
    pub langauge: HashMap<String, AdvLanguageItem>,
}
