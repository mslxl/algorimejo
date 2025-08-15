use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::database::config::{AdvLanguageItem, WorkspaceConfig};
use crate::schema::{documents, problems, solutions, test_cases};
use anyhow::Result;
use diesel::prelude::*;
use diesel::{
    r2d2::{ConnectionManager, Pool},
    SqliteConnection,
};
use log::trace;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::model::{
    Checker, Document, Problem, ProblemChangeset, ProblemRow, Solution, SolutionChangeset,
    SolutionRow, TestCase,
};

pub mod config;
pub mod language;

pub struct DatabaseRepo {
    pool: Pool<ConnectionManager<SqliteConnection>>,
    pub config: Arc<RwLock<WorkspaceConfig>>,
    base_folder: PathBuf,
    doc_folder: PathBuf,
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
    pub limit: Option<i32>,
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

#[derive(Debug, Serialize, Deserialize, Type)]

pub struct CreateProblemParams {
    pub name: String,
    pub url: Option<String>,
    pub description: Option<String>,
    pub statement: Option<String>,
    pub checker: Option<String>,
    pub time_limit: i32,
    pub memory_limit: i32,
    pub initial_solution: Option<CreateSolutionParams>,
}

#[derive(Debug, Serialize, Deserialize, Type)]

pub struct CreateSolutionParams {
    pub author: Option<String>,
    pub name: String,
    pub language: String,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]

pub struct CreateProblemResult {
    pub problem: Problem,
}

#[derive(Debug, Serialize, Deserialize, Type)]

pub struct CreateSolutionResult {
    pub solution: Solution,
}

#[derive(Debug, Serialize, Deserialize, Type)]

pub struct CreateCheckerParams {
    pub name: String,
    pub language: String,
    pub description: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]

pub struct CreateCheckerResult {
    pub checker: Checker,
}

impl DatabaseRepo {
    pub fn new(
        pool: Pool<ConnectionManager<SqliteConnection>>,
        base_folder: PathBuf,
        config: WorkspaceConfig,
    ) -> Self {
        let doc_folder = base_folder.join("doc");
        Self {
            pool,
            base_folder,
            doc_folder,
            config: Arc::new(RwLock::new(config)),
        }
    }
    pub fn save_config(&self, filename: &str) -> Result<()> {
        let guard = self.config.read().unwrap();
        let content = toml::to_string_pretty(&*guard)?;
        let config_file = self.base_folder.join(filename);
        trace!("save config {:?}: {}", config_file.display(), &content);
        std::fs::write(config_file, content)?;
        Ok(())
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

    pub fn create_problem(&self, params: CreateProblemParams) -> Result<CreateProblemResult> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        // Start a transaction
        conn.transaction(|conn| {
            // Use local time to match SQLite's CURRENT_TIMESTAMP behavior
            let now = chrono::Local::now().naive_local();
            let problem_id = Uuid::new_v4().to_string();
            let description = params.description.unwrap_or_default();

            // Create the problem
            let new_problem = (
                problems::id.eq(&problem_id),
                problems::name.eq(&params.name),
                problems::url.eq(&params.url),
                problems::time_limit.eq(params.time_limit),
                problems::memory_limit.eq(params.memory_limit),
                problems::description.eq(&description),
                problems::statement.eq(&params.statement),
                problems::checker.eq(&params.checker),
                problems::create_datetime.eq(now),
                problems::modified_datetime.eq(now),
            );

            diesel::insert_into(problems::table)
                .values(&new_problem)
                .execute(conn)?;

            // Create initial solution if provided
            let mut solutions = Vec::new();
            if let Some(solution_params) = params.initial_solution {
                let solution = self.create_solution_internal(conn, &problem_id, solution_params)?;
                solutions.push(solution);
            }

            // Build the result
            let problem = Problem {
                id: problem_id,
                name: params.name,
                url: params.url,
                description: description,
                statement: params.statement,
                checker: params.checker,
                create_datetime: now,
                modified_datetime: now,
                time_limit: params.time_limit,
                memory_limit: params.memory_limit,
                solutions,
            };

            Ok(CreateProblemResult { problem })
        })
    }

    pub fn create_solution(
        &self,
        problem_id: &str,
        params: CreateSolutionParams,
    ) -> Result<CreateSolutionResult> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        // Verify the problem exists
        let problem_exists = problems::table
            .filter(problems::id.eq(problem_id))
            .count()
            .get_result::<i64>(&mut conn)?
            > 0;

        if !problem_exists {
            return Err(anyhow::anyhow!("Problem with id {} not found", problem_id));
        }

        // Start a transaction
        conn.transaction(|conn| {
            let solution = self.create_solution_internal(conn, problem_id, params)?;
            Ok(CreateSolutionResult { solution })
        })
    }

    fn create_solution_internal(
        &self,
        conn: &mut SqliteConnection,
        problem_id: &str,
        params: CreateSolutionParams,
    ) -> Result<Solution> {
        // Use local time to match SQLite's CURRENT_TIMESTAMP behavior
        let now = chrono::Local::now().naive_local();
        let solution_id = Uuid::new_v4().to_string();
        let document_id = Uuid::new_v4().to_string();
        let document_filename = format!("{}.sol.bin", solution_id);
        let author = params.author.unwrap_or_else(|| whoami::username());

        // Create the document
        // let new_document = (
        //     documents::id.eq(&document_id),
        //     documents::create_datetime.eq(now),
        //     documents::modified_datetime.eq(now),
        //     documents::filename.eq(&document_filename),
        // );
        let new_document = Document {
            id: document_id.clone(),
            create_datetime: now,
            modified_datetime: now,
            filename: document_filename.clone(),
        };

        diesel::insert_into(documents::table)
            .values(&new_document)
            .execute(conn)?;

        // Create the solution
        let new_solution = (
            solutions::id.eq(&solution_id),
            solutions::author.eq(&author),
            solutions::name.eq(&params.name),
            solutions::language.eq(&params.language),
            solutions::problem_id.eq(problem_id),
            solutions::document_id.eq(&document_id),
        );

        diesel::insert_into(solutions::table)
            .values(&new_solution)
            .execute(conn)?;

        // Build the solution result
        let document = Document {
            id: document_id,
            create_datetime: now,
            modified_datetime: now,
            filename: document_filename,
        };

        let solution = Solution {
            id: solution_id,
            author: author,
            name: params.name,
            language: params.language,
            problem_id: problem_id.to_string(),
            document: Some(document),
        };

        Ok(solution)
    }

    pub fn create_checker(&self, params: CreateCheckerParams) -> Result<CreateCheckerResult> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        // Start a transaction
        conn.transaction(|conn| {
            // Use local time to match SQLite's CURRENT_TIMESTAMP behavior
            let now = chrono::Local::now().naive_local();
            let checker_id = Uuid::new_v4().to_string();
            let document_id = Uuid::new_v4().to_string();
            let document_filename = format!("{}.chk.bin", checker_id);

            // Create the document
            let new_document = (
                documents::id.eq(&document_id),
                documents::create_datetime.eq(now),
                documents::modified_datetime.eq(now),
                documents::filename.eq(&document_filename),
            );

            diesel::insert_into(documents::table)
                .values(&new_document)
                .execute(conn)?;

            // Create the checker
            let new_checker = (
                crate::schema::checker::id.eq(&checker_id),
                crate::schema::checker::name.eq(&params.name),
                crate::schema::checker::language.eq(&params.language),
                crate::schema::checker::description.eq(&params.description),
                crate::schema::checker::document_id.eq(&document_id),
            );

            diesel::insert_into(crate::schema::checker::table)
                .values(&new_checker)
                .execute(conn)?;

            // Build the checker result
            let document = Document {
                id: document_id,
                create_datetime: now,
                modified_datetime: now,
                filename: document_filename,
            };

            let checker = Checker {
                id: checker_id,
                name: params.name,
                language: params.language,
                description: params.description,
                document_id: document.id.clone(),
                document: Some(document),
            };

            Ok(CreateCheckerResult { checker })
        })
    }

    pub fn delete_problem(&self, problem_id: &str) -> Result<()> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        diesel::delete(problems::table.filter(problems::id.eq(problem_id))).execute(&mut conn)?;
        Ok(())
    }

    /// Deletes a solution from the database by its ID
    ///
    /// # Arguments
    /// * `solution_id` - The ID of the solution to delete
    ///
    /// # Returns
    /// * `Result<String>` - The ID of the problem that the solution belonged to
    pub fn delete_solution(&self, solution_id: &str) -> Result<String> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;
        let problem_id = solutions::table
            .filter(solutions::id.eq(solution_id))
            .select(solutions::problem_id)
            .first::<String>(&mut conn)?;
        diesel::delete(solutions::table.filter(solutions::id.eq(solution_id)))
            .execute(&mut conn)?;
        Ok(problem_id)
    }

    pub fn get_problem(&self, problem_id: &str) -> Result<Problem> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        // First get the problem row from database
        let problem_row = problems::table
            .filter(problems::id.eq(problem_id))
            .select(ProblemRow::as_select())
            .first::<ProblemRow>(&mut conn)?;

        // Get solutions for this problem
        let solutions = self.get_solutions_for_problem(&problem_row.id)?;

        // Construct the Problem struct with populated solutions
        let problem = Problem {
            id: problem_row.id,
            name: problem_row.name,
            url: problem_row.url,
            description: problem_row.description,
            statement: problem_row.statement,
            time_limit: problem_row.time_limit,
            memory_limit: problem_row.memory_limit,
            checker: problem_row.checker,
            create_datetime: problem_row.create_datetime,
            modified_datetime: problem_row.modified_datetime,
            solutions,
        };

        Ok(problem)
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
            // For datetime-based cursors, parse as local time and convert to naive
            let cursor_datetime = if cursor.contains('T') {
                // This is a datetime cursor
                chrono::DateTime::parse_from_rfc3339(&cursor)
                    .map_err(|e| anyhow::anyhow!("Invalid cursor format: {}", e))?
                    .naive_local()
            } else {
                // This is a name-based cursor, skip datetime filtering
                chrono::DateTime::from_timestamp(0, 0).unwrap().naive_utc()
            };

            match (sort_by, sort_order) {
                (GetProblemsSortBy::CreateDatetime, SortOrder::Asc) => {
                    query = query.filter(problems::create_datetime.gt(cursor_datetime));
                }
                (GetProblemsSortBy::CreateDatetime, SortOrder::Desc) => {
                    query = query.filter(problems::create_datetime.lt(cursor_datetime));
                }
                (GetProblemsSortBy::ModifiedDatetime, SortOrder::Asc) => {
                    query = query.filter(problems::modified_datetime.gt(cursor_datetime));
                }
                (GetProblemsSortBy::ModifiedDatetime, SortOrder::Desc) => {
                    query = query.filter(problems::modified_datetime.lt(cursor_datetime));
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
        query = query.limit((limit + 1).into()); // +1 to check if there are more results

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
                time_limit: row.time_limit,
                memory_limit: row.memory_limit,
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
                    last_problem
                        .create_datetime
                        .and_local_timezone(chrono::Local)
                        .unwrap()
                        .to_rfc3339(),
                ),
                (GetProblemsSortBy::ModifiedDatetime, _) => Some(
                    last_problem
                        .modified_datetime
                        .and_local_timezone(chrono::Local)
                        .unwrap()
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

    pub fn get_solution(&self, solution_id: &str) -> Result<Solution> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;
        let solution = solutions::table
            .filter(solutions::id.eq(solution_id))
            .select(SolutionRow::as_select())
            .first::<SolutionRow>(&mut conn)?;
        let document = self.get_document(&solution.document_id)?;
        Ok(Solution {
            id: solution.id,
            author: solution.author,
            name: solution.name,
            language: solution.language,
            problem_id: solution.problem_id,
            document: document,
        })
    }

    pub fn update_problem(&self, problem_id: &str, params: ProblemChangeset) -> Result<()> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        diesel::update(problems::table.filter(problems::id.eq(problem_id)))
            .set(&params)
            .execute(&mut conn)?;
        Ok(())
    }

    pub fn update_solution(&self, solution_id: &str, params: SolutionChangeset) -> Result<()> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;

        diesel::update(solutions::table.filter(solutions::id.eq(solution_id)))
            .set(&params)
            .execute(&mut conn)?;
        Ok(())
    }

    pub fn get_document_filepath(&self, document_id: &str) -> Result<PathBuf> {
        let mut conn = self.pool.get()?;
        let document = documents::table
            .filter(documents::id.eq(document_id))
            .first::<Document>(&mut conn)?;

        let filepath = self.doc_folder.join(document.filename);
        Ok(filepath)
    }

    pub fn get_testcases(&self, problem_id: &str) -> Result<Vec<TestCase>> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;
        let testcases = test_cases::table
            .filter(test_cases::problem_id.eq(problem_id))
            .select(TestCase::as_select())
            .load::<TestCase>(&mut conn)?;
        Ok(testcases)
    }
    pub fn create_testcase(&self, problem_id: &str) -> Result<TestCase> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;
        let input_document_id = Uuid::new_v4().to_string();
        let answer_document_id = Uuid::new_v4().to_string();
        let testcase_id = Uuid::new_v4().to_string();
        let now = chrono::Local::now().naive_local();
        let input_document = Document {
            id: input_document_id.clone(),
            create_datetime: now,
            modified_datetime: now,
            filename: format!("{}.in.bin", &testcase_id),
        };
        let answer_document = Document {
            id: answer_document_id.clone(),
            create_datetime: now,
            modified_datetime: now,
            filename: format!("{}.ans.bin", &testcase_id),
        };
        let testcase = TestCase {
            id: testcase_id,
            problem_id: problem_id.to_string(),
            input_document_id,
            answer_document_id,
        };
        conn.transaction(|txn| {
            diesel::insert_into(documents::table)
                .values(&input_document)
                .execute(txn)?;
            diesel::insert_into(documents::table)
                .values(&answer_document)
                .execute(txn)?;
            diesel::insert_into(test_cases::table)
                .values(&testcase)
                .execute(txn)
        })?;

        Ok(testcase)
    }
    pub fn delete_testcase(&self, testcase_id: &str) -> Result<()> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;
        diesel::delete(test_cases::table.filter(test_cases::id.eq(testcase_id)))
            .execute(&mut conn)?;
        Ok(())
    }
    pub fn get_language_item(&self, language: &str) -> Result<AdvLanguageItem> {
        let config = self.config.read().unwrap();
        let language_config = config
            .language
            .get(language)
            .ok_or(anyhow::anyhow!("Language {} not found", language))?;
        Ok(language_config.clone())
    }
    pub fn get_languages(&self) -> Result<HashMap<String, AdvLanguageItem>> {
        let config = self.config.read().unwrap();
        let languages = config.language.clone();
        Ok(languages)
    }
}
