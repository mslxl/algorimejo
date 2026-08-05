use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::database::config::{AdvLanguageItem, WorkspaceConfig};
use crate::schema::{
    checker, checker_self_tests, documents, problem_checker, problems, solutions, test_cases,
};
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
    Checker, CheckerKind, CheckerRow, CheckerScope, CheckerSelfTest, Document, Problem,
    ProblemChangeset, ProblemDataChangeset, ProblemRow, Solution, SolutionChangeset, SolutionRow,
    TestCase,
};

pub const DEFAULT_CHECKER_ID: &str = "builtin:wcmp";

pub mod competitive_companion;
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
    pub group: Option<String>,
    pub statement: Option<String>,
    pub checker_id: Option<String>,
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
    pub scope: CheckerScope,
    pub owner_problem_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]

pub struct CreateCheckerResult {
    pub checker: Checker,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct UpdateCheckerParams {
    pub name: String,
    pub language: String,
    pub description: Option<String>,
    pub scope: CheckerScope,
    pub owner_problem_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct CheckerUsage {
    pub problem_id: String,
    pub problem_name: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct UpsertCheckerSelfTestParams {
    pub id: Option<String>,
    pub checker_id: String,
    pub name: String,
    pub expected_verdict: String,
    pub input: String,
    pub output: String,
    pub answer: String,
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
            let group = params.group.unwrap_or_default();

            // Create the problem
            let new_problem = (
                problems::id.eq(&problem_id),
                problems::name.eq(&params.name),
                problems::url.eq(&params.url),
                problems::time_limit.eq(params.time_limit),
                problems::memory_limit.eq(params.memory_limit),
                problems::group.eq(&group),
                problems::statement.eq(&params.statement),
                problems::create_datetime.eq(now),
                problems::modified_datetime.eq(now),
            );

            diesel::insert_into(problems::table)
                .values(&new_problem)
                .execute(conn)?;

            let selected_checker = params
                .checker_id
                .clone()
                .unwrap_or_else(|| DEFAULT_CHECKER_ID.to_string());
            self.validate_checker_visibility(conn, &problem_id, &selected_checker)?;
            diesel::insert_into(problem_checker::table)
                .values((
                    problem_checker::problem_id.eq(&problem_id),
                    problem_checker::checker_id.eq(&selected_checker),
                ))
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
                group: group,
                statement: params.statement,
                checker: self.get_checker_with_conn(conn, &selected_checker)?,
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

        if params.name.trim().is_empty() {
            return Err(anyhow::anyhow!("Checker name cannot be empty"));
        }

        let owner_problem_id = match params.scope {
            CheckerScope::Global => None,
            CheckerScope::Problem => Some(
                params
                    .owner_problem_id
                    .clone()
                    .ok_or_else(|| anyhow::anyhow!("A problem checker must have an owner"))?,
            ),
        };

        conn.transaction(|conn| {
            let now = chrono::Local::now().naive_local();
            let checker_id = Uuid::new_v4().to_string();
            let document_id = Uuid::new_v4().to_string();
            let document_filename = format!("{}.chk.bin", checker_id);

            if let Some(problem_id) = owner_problem_id.as_ref() {
                let exists = problems::table
                    .filter(problems::id.eq(problem_id))
                    .count()
                    .get_result::<i64>(conn)?
                    > 0;
                if !exists {
                    return Err(anyhow::anyhow!("Problem {} not found", problem_id));
                }
            }

            let new_document = Document {
                id: document_id.clone(),
                create_datetime: now,
                modified_datetime: now,
                filename: document_filename,
            };

            diesel::insert_into(documents::table)
                .values(&new_document)
                .execute(conn)?;

            let new_checker = (
                checker::id.eq(&checker_id),
                checker::kind.eq("custom"),
                checker::scope.eq(match params.scope {
                    CheckerScope::Global => "global",
                    CheckerScope::Problem => "problem",
                }),
                checker::owner_problem_id.eq(&owner_problem_id),
                checker::name.eq(params.name.trim()),
                checker::description.eq(&params.description),
                checker::language.eq(Some(&params.language)),
                checker::document_id.eq(Some(&document_id)),
                checker::create_datetime.eq(now),
                checker::modified_datetime.eq(now),
            );

            diesel::insert_into(checker::table)
                .values(&new_checker)
                .execute(conn)?;

            Ok(CreateCheckerResult {
                checker: self.get_checker_with_conn(conn, &checker_id)?,
            })
        })
    }

    pub fn base_folder(&self) -> &std::path::Path {
        &self.base_folder
    }

    pub fn seed_builtin_checkers(&self, names: &[&str]) -> Result<()> {
        let mut conn = self.pool.get()?;
        let now = chrono::Local::now().naive_local();
        conn.transaction(|conn| {
            for name in names {
                let id = format!("builtin:{}", name);
                diesel::insert_into(checker::table)
                    .values((
                        checker::id.eq(id),
                        checker::kind.eq("builtin"),
                        checker::scope.eq("global"),
                        checker::owner_problem_id.eq::<Option<String>>(None),
                        checker::name.eq(*name),
                        checker::description.eq::<Option<String>>(None),
                        checker::language.eq::<Option<String>>(None),
                        checker::document_id.eq::<Option<String>>(None),
                        checker::create_datetime.eq(now),
                        checker::modified_datetime.eq(now),
                    ))
                    .on_conflict(checker::id)
                    .do_nothing()
                    .execute(conn)?;
            }
            diesel::sql_query(format!(
                "INSERT OR IGNORE INTO problem_checker (problem_id, checker_id) SELECT id, '{}' FROM problems",
                DEFAULT_CHECKER_ID
            ))
            .execute(conn)?;
            Ok(())
        })
    }

    fn get_checker_with_conn(
        &self,
        conn: &mut SqliteConnection,
        checker_id: &str,
    ) -> Result<Checker> {
        let row = checker::table
            .filter(checker::id.eq(checker_id))
            .select(CheckerRow::as_select())
            .first::<CheckerRow>(conn)?;
        let document = match row.document_id.as_ref() {
            Some(document_id) => documents::table
                .filter(documents::id.eq(document_id))
                .select(Document::as_select())
                .first::<Document>(conn)
                .optional()?,
            None => None,
        };
        Ok(Checker {
            id: row.id,
            kind: match row.kind.as_str() {
                "builtin" => CheckerKind::Builtin,
                "custom" => CheckerKind::Custom,
                value => return Err(anyhow::anyhow!("Unknown checker kind: {}", value)),
            },
            scope: match row.scope.as_str() {
                "global" => CheckerScope::Global,
                "problem" => CheckerScope::Problem,
                value => return Err(anyhow::anyhow!("Unknown checker scope: {}", value)),
            },
            owner_problem_id: row.owner_problem_id,
            name: row.name,
            description: row.description,
            language: row.language,
            document,
            create_datetime: row.create_datetime,
            modified_datetime: row.modified_datetime,
        })
    }

    pub fn get_checker(&self, checker_id: &str) -> Result<Checker> {
        let mut conn = self.pool.get()?;
        self.get_checker_with_conn(&mut conn, checker_id)
    }

    pub fn get_visible_checkers(&self, problem_id: Option<&str>) -> Result<Vec<Checker>> {
        let mut conn = self.pool.get()?;
        let mut query = checker::table.into_boxed();
        query = match problem_id {
            Some(problem_id) => query.filter(
                checker::scope
                    .eq("global")
                    .or(checker::owner_problem_id.eq(problem_id)),
            ),
            None => query.filter(checker::scope.eq("global")),
        };
        let rows = query
            .order((checker::kind.asc(), checker::name.asc()))
            .select(CheckerRow::as_select())
            .load::<CheckerRow>(&mut conn)?;
        rows.into_iter()
            .map(|row| self.get_checker_with_conn(&mut conn, &row.id))
            .collect()
    }

    fn validate_checker_visibility(
        &self,
        conn: &mut SqliteConnection,
        problem_id: &str,
        checker_id: &str,
    ) -> Result<()> {
        let visible = checker::table
            .filter(checker::id.eq(checker_id))
            .filter(
                checker::scope
                    .eq("global")
                    .or(checker::owner_problem_id.eq(problem_id)),
            )
            .count()
            .get_result::<i64>(conn)?
            > 0;
        if !visible {
            return Err(anyhow::anyhow!(
                "Checker {} is not visible to problem {}",
                checker_id,
                problem_id
            ));
        }
        Ok(())
    }

    pub fn get_visible_checker(&self, problem_id: &str, checker_id: &str) -> Result<Checker> {
        let mut conn = self.pool.get()?;
        self.validate_checker_visibility(&mut conn, problem_id, checker_id)?;
        self.get_checker_with_conn(&mut conn, checker_id)
    }

    pub fn set_problem_checker(&self, problem_id: &str, checker_id: &str) -> Result<()> {
        let mut conn = self.pool.get()?;
        conn.transaction(|conn| {
            self.validate_checker_visibility(conn, problem_id, checker_id)?;
            diesel::insert_into(problem_checker::table)
                .values((
                    problem_checker::problem_id.eq(problem_id),
                    problem_checker::checker_id.eq(checker_id),
                ))
                .on_conflict(problem_checker::problem_id)
                .do_update()
                .set(problem_checker::checker_id.eq(checker_id))
                .execute(conn)?;
            Ok(())
        })
    }

    fn get_problem_checker_with_conn(
        &self,
        conn: &mut SqliteConnection,
        problem_id: &str,
    ) -> Result<Checker> {
        let checker_id = problem_checker::table
            .filter(problem_checker::problem_id.eq(problem_id))
            .select(problem_checker::checker_id)
            .first::<String>(conn)
            .optional()?
            .unwrap_or_else(|| DEFAULT_CHECKER_ID.to_string());
        self.get_checker_with_conn(conn, &checker_id)
    }

    pub fn update_checker(&self, checker_id: &str, params: UpdateCheckerParams) -> Result<Checker> {
        let mut conn = self.pool.get()?;
        let existing = self.get_checker_with_conn(&mut conn, checker_id)?;
        if existing.kind == CheckerKind::Builtin {
            return Err(anyhow::anyhow!("Built-in checkers are read-only"));
        }
        if params.name.trim().is_empty() {
            return Err(anyhow::anyhow!("Checker name cannot be empty"));
        }
        let owner_problem_id = match params.scope {
            CheckerScope::Global => None,
            CheckerScope::Problem => Some(
                params
                    .owner_problem_id
                    .ok_or_else(|| anyhow::anyhow!("A problem checker must have an owner"))?,
            ),
        };
        if let Some(owner_problem_id) = owner_problem_id.as_ref() {
            let invisible_usages = problem_checker::table
                .filter(problem_checker::checker_id.eq(checker_id))
                .filter(problem_checker::problem_id.ne(owner_problem_id))
                .count()
                .get_result::<i64>(&mut conn)?;
            if invisible_usages > 0 {
                return Err(anyhow::anyhow!(
                    "Checker is used by another problem and cannot be made problem-local"
                ));
            }
        }
        diesel::update(checker::table.filter(checker::id.eq(checker_id)))
            .set((
                checker::scope.eq(match params.scope {
                    CheckerScope::Global => "global",
                    CheckerScope::Problem => "problem",
                }),
                checker::owner_problem_id.eq(owner_problem_id),
                checker::name.eq(params.name.trim()),
                checker::description.eq(params.description),
                checker::language.eq(Some(params.language)),
            ))
            .execute(&mut conn)?;
        self.get_checker_with_conn(&mut conn, checker_id)
    }

    pub fn get_checker_usages(&self, checker_id: &str) -> Result<Vec<CheckerUsage>> {
        let mut conn = self.pool.get()?;
        let rows = problem_checker::table
            .inner_join(problems::table)
            .filter(problem_checker::checker_id.eq(checker_id))
            .select((problems::id, problems::name))
            .load::<(String, String)>(&mut conn)?;
        Ok(rows
            .into_iter()
            .map(|(problem_id, problem_name)| CheckerUsage {
                problem_id,
                problem_name,
            })
            .collect())
    }

    pub fn delete_checker(&self, checker_id: &str) -> Result<()> {
        let existing = self.get_checker(checker_id)?;
        if existing.kind == CheckerKind::Builtin {
            return Err(anyhow::anyhow!("Built-in checkers cannot be deleted"));
        }
        if !self.get_checker_usages(checker_id)?.is_empty() {
            return Err(anyhow::anyhow!(
                "Checker is still used by one or more problems"
            ));
        }
        let document = existing.document;
        let mut conn = self.pool.get()?;
        conn.transaction(|conn| {
            diesel::delete(checker::table.filter(checker::id.eq(checker_id))).execute(conn)?;
            if let Some(document) = document.as_ref() {
                diesel::delete(documents::table.filter(documents::id.eq(&document.id)))
                    .execute(conn)?;
            }
            Ok::<(), diesel::result::Error>(())
        })?;
        if let Some(document) = document {
            let path = self.doc_folder.join(document.filename);
            if path.exists() {
                std::fs::remove_file(path)?;
            }
        }
        Ok(())
    }

    pub fn get_checker_self_tests(&self, checker_id: &str) -> Result<Vec<CheckerSelfTest>> {
        let mut conn = self.pool.get()?;
        Ok(checker_self_tests::table
            .filter(checker_self_tests::checker_id.eq(checker_id))
            .order(checker_self_tests::name.asc())
            .select(CheckerSelfTest::as_select())
            .load(&mut conn)?)
    }

    pub fn get_checker_self_test(&self, self_test_id: &str) -> Result<CheckerSelfTest> {
        let mut conn = self.pool.get()?;
        Ok(checker_self_tests::table
            .filter(checker_self_tests::id.eq(self_test_id))
            .select(CheckerSelfTest::as_select())
            .first(&mut conn)?)
    }

    pub fn upsert_checker_self_test(
        &self,
        params: UpsertCheckerSelfTestParams,
    ) -> Result<CheckerSelfTest> {
        if !matches!(
            params.expected_verdict.as_str(),
            "AC" | "WA" | "PE" | "CHKRE"
        ) {
            return Err(anyhow::anyhow!("Invalid expected checker verdict"));
        }
        let mut conn = self.pool.get()?;
        let item = CheckerSelfTest {
            id: params.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            checker_id: params.checker_id,
            name: params.name,
            expected_verdict: params.expected_verdict,
            input: params.input,
            output: params.output,
            answer: params.answer,
        };
        diesel::insert_into(checker_self_tests::table)
            .values(&item)
            .on_conflict(checker_self_tests::id)
            .do_update()
            .set((
                checker_self_tests::name.eq(&item.name),
                checker_self_tests::expected_verdict.eq(&item.expected_verdict),
                checker_self_tests::input.eq(&item.input),
                checker_self_tests::output.eq(&item.output),
                checker_self_tests::answer.eq(&item.answer),
            ))
            .execute(&mut conn)?;
        Ok(item)
    }

    pub fn delete_checker_self_test(&self, self_test_id: &str) -> Result<()> {
        let mut conn = self.pool.get()?;
        diesel::delete(checker_self_tests::table.filter(checker_self_tests::id.eq(self_test_id)))
            .execute(&mut conn)?;
        Ok(())
    }

    pub fn delete_problem(&self, problem_id: &str) -> Result<Vec<Document>> {
        let mut conn = self.pool.get().map_err(|e| anyhow::anyhow!("{}", e))?;
        let checker_documents = checker::table
            .inner_join(documents::table.on(checker::document_id.eq(documents::id.nullable())))
            .filter(checker::owner_problem_id.eq(problem_id))
            .select(Document::as_select())
            .load::<Document>(&mut conn)?;
        conn.transaction(|conn| {
            diesel::delete(problems::table.filter(problems::id.eq(problem_id))).execute(conn)?;
            for document in &checker_documents {
                diesel::delete(documents::table.filter(documents::id.eq(&document.id)))
                    .execute(conn)?;
            }
            Ok::<(), diesel::result::Error>(())
        })?;
        for document in &checker_documents {
            let path = self.doc_folder.join(&document.filename);
            if path.exists() {
                std::fs::remove_file(path)?;
            }
        }
        Ok(checker_documents)
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
        let selected_checker = self.get_problem_checker_with_conn(&mut conn, &problem_row.id)?;

        // Construct the Problem struct with populated solutions
        let problem = Problem {
            id: problem_row.id,
            name: problem_row.name,
            url: problem_row.url,
            group: problem_row.group,
            statement: problem_row.statement,
            time_limit: problem_row.time_limit,
            memory_limit: problem_row.memory_limit,
            checker: selected_checker,
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
                    .or(problems::group.like(search_pattern)),
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
                group: row.group.clone(),
                statement: row.statement.clone(),
                checker: self.get_problem_checker_with_conn(&mut conn, &row.id)?,
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
        conn.transaction(|conn| {
            let data = ProblemDataChangeset {
                name: params.name,
                url: params.url,
                group: params.group,
                statement: params.statement,
                time_limit: params.time_limit,
                memory_limit: params.memory_limit,
            };
            diesel::update(problems::table.filter(problems::id.eq(problem_id)))
                .set(&data)
                .execute(conn)?;
            if let Some(checker_id) = params.checker_id {
                self.validate_checker_visibility(conn, problem_id, &checker_id)?;
                diesel::insert_into(problem_checker::table)
                    .values((
                        problem_checker::problem_id.eq(problem_id),
                        problem_checker::checker_id.eq(&checker_id),
                    ))
                    .on_conflict(problem_checker::problem_id)
                    .do_update()
                    .set(problem_checker::checker_id.eq(&checker_id))
                    .execute(conn)?;
            }
            Ok(())
        })
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database::config::WorkspaceLocalDeserialized, setup::MIGRATIONS};
    use diesel_migrations::MigrationHarness;

    fn test_repo() -> DatabaseRepo {
        let manager = ConnectionManager::<SqliteConnection>::new(":memory:");
        let pool = Pool::builder().max_size(1).build(manager).unwrap();
        {
            let mut connection = pool.get().unwrap();
            diesel::sql_query("PRAGMA foreign_keys = ON")
                .execute(&mut connection)
                .unwrap();
            connection.run_pending_migrations(MIGRATIONS).unwrap();
        }
        let base = std::env::temp_dir().join(format!("algorimejo-checker-test-{}", Uuid::new_v4()));
        let repo = DatabaseRepo::new(pool, base, WorkspaceLocalDeserialized::default().into());
        repo.seed_builtin_checkers(&["wcmp", "ncmp"]).unwrap();
        repo
    }

    fn create_problem(repo: &DatabaseRepo, name: &str) -> Problem {
        repo.create_problem(CreateProblemParams {
            name: name.to_string(),
            url: None,
            group: None,
            statement: None,
            checker_id: None,
            time_limit: 1000,
            memory_limit: 0,
            initial_solution: None,
        })
        .unwrap()
        .problem
    }

    fn create_checker(
        repo: &DatabaseRepo,
        name: &str,
        scope: CheckerScope,
        owner_problem_id: Option<String>,
    ) -> Checker {
        repo.create_checker(CreateCheckerParams {
            name: name.to_string(),
            language: "cpp 17".to_string(),
            description: None,
            content: None,
            scope,
            owner_problem_id,
        })
        .unwrap()
        .checker
    }

    #[test]
    fn new_problems_use_the_seeded_default_checker() {
        let repo = test_repo();
        let problem = create_problem(&repo, "A");

        assert_eq!(problem.checker.id, DEFAULT_CHECKER_ID);
        assert_eq!(problem.checker.kind, CheckerKind::Builtin);
    }

    #[test]
    fn problem_checkers_are_only_visible_to_their_owner() {
        let repo = test_repo();
        let first = create_problem(&repo, "A");
        let second = create_problem(&repo, "B");
        let local = create_checker(
            &repo,
            "local",
            CheckerScope::Problem,
            Some(first.id.clone()),
        );

        assert!(repo.get_visible_checker(&first.id, &local.id).is_ok());
        assert!(repo.get_visible_checker(&second.id, &local.id).is_err());
        assert!(repo.set_problem_checker(&second.id, &local.id).is_err());
    }

    #[test]
    fn a_used_global_checker_cannot_be_made_local_to_another_problem() {
        let repo = test_repo();
        let first = create_problem(&repo, "A");
        let second = create_problem(&repo, "B");
        let global = create_checker(&repo, "shared", CheckerScope::Global, None);
        repo.set_problem_checker(&second.id, &global.id).unwrap();

        let result = repo.update_checker(
            &global.id,
            UpdateCheckerParams {
                name: global.name,
                language: global.language.unwrap(),
                description: None,
                scope: CheckerScope::Problem,
                owner_problem_id: Some(first.id),
            },
        );

        assert!(result.is_err());
        assert_eq!(
            repo.get_checker(&global.id).unwrap().scope,
            CheckerScope::Global
        );
    }

    #[test]
    fn deleting_a_problem_removes_its_local_checker_document() {
        let repo = test_repo();
        let problem = create_problem(&repo, "A");
        let local = create_checker(
            &repo,
            "local",
            CheckerScope::Problem,
            Some(problem.id.clone()),
        );
        let document_id = local.document.unwrap().id;

        let removed_documents = repo.delete_problem(&problem.id).unwrap();

        assert_eq!(removed_documents.len(), 1);
        assert_eq!(removed_documents[0].id, document_id);
        assert!(repo.get_checker(&local.id).is_err());
        assert!(repo.get_document(&document_id).unwrap().is_none());
    }
}
