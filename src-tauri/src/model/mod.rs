use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::Selectable;
use serde::{Deserialize, Serialize};
use specta::Type;

//TODO: Implement the statement enum and add it to database
// #[derive(Debug, Serialize, Deserialize, Type)]
// #[serde(tag = "type")]
// pub enum Statement{
//     Markdown{
//         markdown: String
//     },
//     Text{
//         txt: String
//     },
//     PDF {
//         path: String
//     }
// }

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct Problem {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub group: String,
    pub statement: Option<String>,
    pub checker: Checker,
    pub create_datetime: NaiveDateTime,
    pub modified_datetime: NaiveDateTime,
    pub time_limit: i32,
    pub memory_limit: i32,
    pub solutions: Vec<Solution>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ProblemChangeset {
    pub name: Option<String>,
    pub url: Option<String>,
    pub group: Option<String>,
    pub statement: Option<String>,
    pub checker_id: Option<String>,
    pub time_limit: Option<i32>,
    pub memory_limit: Option<i32>,
}

#[derive(Debug, AsChangeset)]
#[diesel(table_name = crate::schema::problems)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ProblemDataChangeset {
    pub name: Option<String>,
    pub url: Option<String>,
    pub group: Option<String>,
    pub statement: Option<String>,
    pub time_limit: Option<i32>,
    pub memory_limit: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Queryable, Identifiable, Type)]
#[diesel(table_name = crate::schema::solutions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[diesel(belongs_to(Problem))]

pub struct Solution {
    pub id: String,
    pub author: String,
    pub name: String,
    pub language: String,
    pub problem_id: String,
    pub document: Option<Document>,
}

#[derive(Debug, Serialize, Deserialize, Type, AsChangeset)]
#[diesel(table_name = crate::schema::solutions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SolutionChangeset {
    pub name: Option<String>,
    pub author: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = crate::schema::problems)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ProblemRow {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub group: String,
    pub statement: Option<String>,
    pub time_limit: i32,
    pub memory_limit: i32,
    pub create_datetime: NaiveDateTime,
    pub modified_datetime: NaiveDateTime,
}

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = crate::schema::solutions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SolutionRow {
    pub id: String,
    pub author: String,
    pub name: String,
    pub language: String,
    pub problem_id: String,
    pub document_id: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
pub enum CheckerKind {
    Builtin,
    Custom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
pub enum CheckerScope {
    Global,
    Problem,
}

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = crate::schema::checker)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct CheckerRow {
    pub id: String,
    pub kind: String,
    pub scope: String,
    pub owner_problem_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub language: Option<String>,
    pub document_id: Option<String>,
    pub create_datetime: NaiveDateTime,
    pub modified_datetime: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Checker {
    pub id: String,
    pub kind: CheckerKind,
    pub scope: CheckerScope,
    pub owner_problem_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub language: Option<String>,
    pub document: Option<Document>,
    pub create_datetime: NaiveDateTime,
    pub modified_datetime: NaiveDateTime,
}

#[derive(
    Debug, Clone, Serialize, Deserialize, Queryable, Identifiable, Selectable, Type, Insertable,
)]
#[diesel(table_name = crate::schema::checker_self_tests)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct CheckerSelfTest {
    pub id: String,
    pub checker_id: String,
    pub name: String,
    pub expected_verdict: String,
    pub input: String,
    pub output: String,
    pub answer: String,
}

#[derive(
    Debug, Clone, Serialize, Deserialize, Queryable, Identifiable, Selectable, Type, Insertable,
)]
#[diesel(table_name = crate::schema::documents)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]

pub struct Document {
    pub id: String,
    pub create_datetime: NaiveDateTime,
    pub modified_datetime: NaiveDateTime,
    pub filename: String,
}

#[derive(Debug, Serialize, Deserialize, Queryable, Identifiable, Type, Selectable, Insertable)]
#[diesel(table_name = crate::schema::test_cases)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]

pub struct TestCase {
    pub id: String,
    pub problem_id: String,
    pub input_document_id: String,
    pub answer_document_id: String,
}
