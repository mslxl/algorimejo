use chrono::{DateTime, Utc};
use diesel::prelude::*;
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
    pub checker_name: String,
    pub create_datetime: DateTime<Utc>,
    pub modified_datetime: DateTime<Utc>,
    pub solutions: Vec<Solution>,
}

#[derive(Debug, Serialize, Deserialize, Queryable, Identifiable, Type)]
#[diesel(table_name = crate::schema::solutions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Solution {
    pub id: String,
    pub author: String,
    pub name: String,
    pub language: String,
    pub problem_id: String,
    pub document_id: String,
    pub document: Document,
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
}

#[derive(Debug, Serialize, Deserialize, Queryable, Identifiable, Type)]
#[diesel(table_name = crate::schema::documents)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct Document {
    pub id: String,
    pub create_datetime: DateTime<Utc>,
    pub modified_datetime: DateTime<Utc>,
    pub filename: String,
}
