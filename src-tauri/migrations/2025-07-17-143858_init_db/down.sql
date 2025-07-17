-- Drop triggers (only for tables with modified_datetime column)
DROP TRIGGER IF EXISTS update_documents_modified_time;
DROP TRIGGER IF EXISTS update_problems_modified_time;
-- Drop indexes for documents table
DROP INDEX IF EXISTS idx_documents_modified_datetime;
DROP INDEX IF EXISTS idx_documents_create_datetime;
DROP INDEX IF EXISTS idx_documents_filename;
-- Drop indexes for checker table
DROP INDEX IF EXISTS idx_checker_language;
DROP INDEX IF EXISTS idx_checker_name;
-- Drop indexes for test_cases table
DROP INDEX IF EXISTS idx_test_cases_problem_id;
-- Drop indexes for solutions table
DROP INDEX IF EXISTS idx_solutions_language;
DROP INDEX IF EXISTS idx_solutions_author;
DROP INDEX IF EXISTS idx_solutions_name;
DROP INDEX IF EXISTS idx_solutions_problem_id;
-- Drop indexes for problems table
DROP INDEX IF EXISTS idx_problems_modified_datetime;
DROP INDEX IF EXISTS idx_problems_create_datetime;
DROP INDEX IF EXISTS idx_problems_name;
-- Drop tables in reverse order due to foreign key constraints
DROP TABLE IF EXISTS test_cases;
DROP TABLE IF EXISTS solutions;
DROP TABLE IF EXISTS checker;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS problems;