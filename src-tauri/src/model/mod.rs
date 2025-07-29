use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::Selectable;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Deserialize, Queryable, Identifiable, Type)]
#[diesel(table_name = crate::schema::problems)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Problem {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    pub description: String,
    pub statement: Option<String>,
    pub checker: Option<String>,
    pub create_datetime: NaiveDateTime,
    pub modified_datetime: NaiveDateTime,
    pub solutions: Vec<Solution>,
}

#[derive(Debug, Serialize, Deserialize, Type, AsChangeset)]
#[diesel(table_name = crate::schema::problems)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ProblemChangeset {
    pub name: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub statement: Option<String>,
    pub checker: Option<String>,
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
    pub description: String,
    pub statement: Option<String>,
    pub checker: Option<String>,
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

#[derive(Debug, Serialize, Deserialize, Queryable, Identifiable, Type)]
#[diesel(table_name = crate::schema::checker)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Checker {
    pub id: String,
    pub name: String,
    pub language: String,
    pub description: Option<String>,
    pub document_id: String,
    pub document: Option<Document>,
}

#[derive(Debug, Serialize, Deserialize, Queryable, Identifiable, Selectable, Type)]
#[diesel(table_name = crate::schema::documents)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Document {
    pub id: String,
    pub create_datetime: NaiveDateTime,
    pub modified_datetime: NaiveDateTime,
    pub filename: String,
}
