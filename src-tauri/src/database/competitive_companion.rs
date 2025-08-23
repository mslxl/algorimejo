use anyhow::Result;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::Manager;

use crate::{
    commands::get_default_create_problem_params, database::DatabaseRepo, document::DocumentRepo,
};

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct CompetitiveCompanionTest {
    input: String,
    output: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
#[serde(tag = "type")]
pub enum CompetitiveCompanionInputType {
    #[serde(rename = "stdin")]
    Stdin,
    #[serde(rename = "file")]
    File {
        #[serde(rename = "fileName")]
        file_name: String,
    },
    #[serde(rename = "regex")]
    Regex { pattern: String },
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
#[serde(tag = "type")]
pub enum CompetitiveCompanionOutputType {
    #[serde(rename = "stdout")]
    Stdout,
    #[serde(rename = "file")]
    File {
        #[serde(rename = "fileName")]
        file_name: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct CompetitiveCompanionBatch {
    id: String,
    size: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct CompetitiveCompanionLanguages {
    java: Option<CompetitiveCompanionLanguageJava>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct CompetitiveCompanionLanguageJava {
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(rename = "taskClass")]
    task_class: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub enum CompetitiveCompanionTestType {
    #[serde(rename = "single")]
    Single,
    #[serde(rename = "multiNumber")]
    MultiNumber,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct CompetitiveCompanionMessage {
    name: String,
    group: String,
    url: String,
    interactive: Option<bool>,
    #[serde(rename = "memoryLimit")]
    /// memory limit in MB
    memory_limit: u64,
    #[serde(rename = "timeLimit")]
    /// time limit in milliseconds
    time_limit: u64,
    tests: Vec<CompetitiveCompanionTest>,
    #[serde(rename = "testType")]
    test_type: CompetitiveCompanionTestType,
    input: CompetitiveCompanionInputType,
    output: CompetitiveCompanionOutputType,
    languages: CompetitiveCompanionLanguages,
    batch: CompetitiveCompanionBatch,
}

type ProblemID = String;
pub async fn handle_competitive_companion_message(
    app: tauri::AppHandle,
    message: &str,
) -> Result<ProblemID> {
    let db = app.state::<DatabaseRepo>();
    let doc_repo = app.state::<DocumentRepo>();
    let message: CompetitiveCompanionMessage = serde_json::from_str(message)?;
    let result = db.create_problem(
        get_default_create_problem_params(
            app.clone(),
            message.name.clone(),
            Some(message.group.clone()),
            Some(message.url.clone()),
            None,
        )
        .await
        .map_err(|e| anyhow::anyhow!(e))?,
    )?;

    let id = result.problem.id;
    for test in message.tests {
        let testcase = db.create_testcase(&id)?;
        doc_repo.manage(
            testcase.input_document_id.clone(),
            db.get_document_filepath(&testcase.input_document_id)?,
        )?;
        doc_repo.manage(
            testcase.answer_document_id.clone(),
            db.get_document_filepath(&testcase.answer_document_id)?,
        )?;
        doc_repo.set_string_of_doc(&testcase.input_document_id, "content", &test.input)?;
        doc_repo.set_string_of_doc(&testcase.answer_document_id, "content", &test.output)?;
    }

    Ok(id)
}
