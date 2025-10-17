use serde::{Deserialize, Serialize};
use specta::Type;


#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
pub enum LanguageBase {
    Cpp,
    TypeScript,
    JavaScript,
    Go,
    Python,
    Text,
    Unknown,
}

impl From<&str> for LanguageBase {
    fn from(value: &str) -> Self {
        match value {
            "cpp" => LanguageBase::Cpp,
            "ts" | "typescript" => LanguageBase::TypeScript,
            "js" | "javascript" => LanguageBase::JavaScript,
            "go" => LanguageBase::Go,
            "py" | "python" => LanguageBase::Python,
            "text" | "plaintext" => LanguageBase::Text,
            _ => LanguageBase::Unknown,
        }
    }
}

impl LanguageBase {
    pub fn extension(&self) -> &str {
        match self {
            LanguageBase::Cpp => "cpp",
            LanguageBase::TypeScript => "ts",
            LanguageBase::JavaScript => "js",
            LanguageBase::Go => "go",
            LanguageBase::Python => "py",
            LanguageBase::Text => "txt",
            LanguageBase::Unknown => "txt",
        }
    }
}