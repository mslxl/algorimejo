use std::path::PathBuf;

use crate::schema::{documents, problems, solutions};
use anyhow::Result;
use diesel::prelude::*;
use diesel::{
    r2d2::{ConnectionManager, Pool},
    SqliteConnection,
};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::model::{Document, Problem, ProblemRow, Solution, SolutionRow};

pub struct DatabaseRepo {
    pool: Pool<ConnectionManager<SqliteConnection>>,
    base_folder: PathBuf,
}

#[derive(Debug, Serialize, Deserialize, Type, Clone, Copy)]
pub enum GetProblemsSortBy {
    Name,
    CreateDatetime,
    ModifiedDatetime,
}

#[derive(Debug, Serialize, Deserialize, Type, Clone, Copy)]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct GetProblemsParams {
    pub cursor: Option<String>,
    pub limit: Option<i64>,
    pub search: Option<String>,
    pub sort_by: Option<GetProblemsSortBy>, // "create_datetime" or "modified_datetime"
    pub sort_order: Option<SortOrder>,      // "asc" or "desc"
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct GetProblemsResult {
    pub problems: Vec<Problem>,
    pub next_cursor: Option<String>,
    pub has_more: bool,
}

impl DatabaseRepo {
    pub fn new(pool: Pool<ConnectionManager<SqliteConnection>>, base_folder: PathBuf) -> Self {
        Self { pool, base_folder }
    }

    pub fn get_document(&self, document_id: &str) -> Result<Option<Document>> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        let result = documents::table
            .filter(documents::id.eq(document_id))
            .select(Document::as_select())
            .first::<Document>(&mut conn)
            .optional()?;

        Ok(result)
    }

    pub fn get_solutions_for_problem(&self, problem_id: &str) -> Result<Vec<Solution>> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        // Get solutions for the problem using automatic struct mapping
        let solutions_data = solutions::table
            .filter(solutions::problem_id.eq(problem_id))
            .select(SolutionRow::as_select())
            .load::<SolutionRow>(&mut conn)?;

        // Fetch documents for each solution
        let mut solutions: Vec<Solution> = Vec::new();
        for solution_row in solutions_data {
            let mut solution = Solution {
                id: solution_row.id,
                author: solution_row.author,
                name: solution_row.name,
                language: solution_row.language,
                problem_id: solution_row.problem_id,
                document: None,
            };
            if let Some(document) = self.get_document(&solution_row.document_id)? {
                solution.document = Some(document);
            }
            solutions.push(solution);
        }

        Ok(solutions)
    }

    pub fn get_problems(&self, params: GetProblemsParams) -> Result<GetProblemsResult> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        let limit = params.limit.unwrap_or(20).min(100); // Max 100 items per page
        let search = params.search;
        let sort_by = params.sort_by.unwrap_or(GetProblemsSortBy::CreateDatetime);
        let sort_order = params.sort_order.unwrap_or(SortOrder::Desc);

        // Build the query
        let mut query = problems::table.into_boxed();

        // Apply search filter if provided
        if let Some(search_term) = search {
            let search_pattern = format!("%{}%", search_term);
            query = query.filter(
                problems::name
                    .like(search_pattern.clone())
                    .or(problems::url.like(search_pattern.clone()))
                    .or(problems::description.like(search_pattern)),
            );
        }

        // Apply cursor-based pagination
        if let Some(cursor) = params.cursor {
            let cursor_datetime = chrono::DateTime::parse_from_rfc3339(&cursor)
                .map_err(|e| anyhow::anyhow!("Invalid cursor format: {}", e))?;

            match (sort_by, sort_order) {
                (GetProblemsSortBy::CreateDatetime, SortOrder::Asc) => {
                    query = query.filter(problems::create_datetime.gt(cursor_datetime.naive_utc()));
                }
                (GetProblemsSortBy::CreateDatetime, SortOrder::Desc) => {
                    query = query.filter(problems::create_datetime.lt(cursor_datetime.naive_utc()));
                }
                (GetProblemsSortBy::ModifiedDatetime, SortOrder::Asc) => {
                    query =
                        query.filter(problems::modified_datetime.gt(cursor_datetime.naive_utc()));
                }
                (GetProblemsSortBy::ModifiedDatetime, SortOrder::Desc) => {
                    query =
                        query.filter(problems::modified_datetime.lt(cursor_datetime.naive_utc()));
                }
                (GetProblemsSortBy::Name, SortOrder::Asc) => {
                    query = query.order(problems::name.asc());
                }
                (GetProblemsSortBy::Name, SortOrder::Desc) => {
                    query = query.order(problems::name.desc());
                }
            }
        }

        // Apply sorting
        query = match (sort_by, sort_order) {
            (GetProblemsSortBy::CreateDatetime, SortOrder::Asc) => {
                query.order(problems::create_datetime.asc())
            }
            (GetProblemsSortBy::CreateDatetime, SortOrder::Desc) => {
                query.order(problems::create_datetime.desc())
            }
            (GetProblemsSortBy::ModifiedDatetime, SortOrder::Asc) => {
                query.order(problems::modified_datetime.asc())
            }
            (GetProblemsSortBy::ModifiedDatetime, SortOrder::Desc) => {
                query.order(problems::modified_datetime.desc())
            }
            (GetProblemsSortBy::Name, SortOrder::Asc) => query.order(problems::name.asc()),
            (GetProblemsSortBy::Name, SortOrder::Desc) => query.order(problems::name.desc()),
        };

        // Apply limit
        query = query.limit(limit + 1); // +1 to check if there are more results

        // Execute the query
        let results: Vec<ProblemRow> = query.select(ProblemRow::as_select()).load(&mut conn)?;

        let has_more = results.len() > limit as usize;
        let problems_data = if has_more {
            &results[..limit as usize]
        } else {
            &results
        };

        // Convert to Problem structs and populate solutions
        let mut problems: Vec<Problem> = Vec::new();
        for row in problems_data {
            let problem_solutions = self.get_solutions_for_problem(&row.id)?;

            let problem = Problem {
                id: row.id.clone(),
                name: row.name.clone(),
                url: row.url.clone(),
                description: row.description.clone(),
                statement: row.statement.clone(),
                checker: row.checker.clone(),
                create_datetime: row.create_datetime,
                modified_datetime: row.modified_datetime,
                solutions: problem_solutions,
            };
            problems.push(problem);
        }

        // Determine next cursor
        let next_cursor = if has_more {
            let last_problem = problems.last().unwrap();
            match (sort_by, sort_order) {
                (GetProblemsSortBy::CreateDatetime, _) => Some(
                    chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                        last_problem.create_datetime,
                        chrono::Utc,
                    )
                    .to_rfc3339(),
                ),
                (GetProblemsSortBy::ModifiedDatetime, _) => Some(
                    chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                        last_problem.modified_datetime,
                        chrono::Utc,
                    )
                    .to_rfc3339(),
                ),
                (GetProblemsSortBy::Name, _) => Some(last_problem.name.clone()),
            }
        } else {
            None
        };

        Ok(GetProblemsResult {
            problems,
            next_cursor,
            has_more,
        })
    }
}
