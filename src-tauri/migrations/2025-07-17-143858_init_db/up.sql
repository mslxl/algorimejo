-- Create problems table
CREATE TABLE problems (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NULL,
    description TEXT NOT NULL DEFAULT '',
    statement TEXT NULL,
    checker TEXT NOT NULL DEFAULT 'ncmp',
    create_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Create solutions table
CREATE TABLE solutions (
    id TEXT NOT NULL PRIMARY KEY,
    author TEXT NOT NULL DEFAULT 'anonymous',
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    FOREIGN KEY (problem_id) REFERENCES problems (id) ON DELETE CASCADE
);
-- Create test_cases table
CREATE TABLE test_cases (
    id TEXT NOT NULL PRIMARY KEY,
    problem_id TEXT NOT NULL,
    input_document_id TEXT NOT NULL,
    answer_document_id TEXT NOT NULL,
    FOREIGN KEY (problem_id) REFERENCES problems (id) ON DELETE CASCADE,
    FOREIGN KEY (input_document_id) REFERENCES documents (id) ON DELETE CASCADE,
    FOREIGN KEY (answer_document_id) REFERENCES documents (id) ON DELETE CASCADE
);
-- Create checker table
CREATE TABLE checker(
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    description TEXT NULL,
    document_id TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
);
-- Create yjs documents table
CREATE TABLE documents (
    id TEXT NOT NULL PRIMARY KEY,
    create_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    filename TEXT NOT NULL
);
-- Create triggers to automatically update modified_time (only for tables with modified_datetime column)
CREATE TRIGGER update_problems_modified_time
AFTER
UPDATE ON problems FOR EACH ROW BEGIN
UPDATE problems
SET modified_datetime = CURRENT_TIMESTAMP
WHERE id = NEW.id;
END;
CREATE TRIGGER update_documents_modified_time
AFTER
UPDATE ON documents FOR EACH ROW BEGIN
UPDATE documents
SET modified_datetime = CURRENT_TIMESTAMP
WHERE id = NEW.id;
END;
-- Create indexes for better performance and cursor-based pagination
-- Problems table indexes
CREATE INDEX idx_problems_name ON problems (name, id);
CREATE INDEX idx_problems_create_datetime ON problems (create_datetime, id);
CREATE INDEX idx_problems_modified_datetime ON problems (modified_datetime, id);
-- Solutions table indexes
CREATE INDEX idx_solutions_problem_id ON solutions (problem_id);
CREATE INDEX idx_solutions_name ON solutions (name, id);
CREATE INDEX idx_solutions_author ON solutions (author, id);
CREATE INDEX idx_solutions_language ON solutions (language, id);
-- Test cases table indexes
CREATE INDEX idx_test_cases_problem_id ON test_cases (problem_id);
-- Checker table indexes
CREATE INDEX idx_checker_name ON checker (name, id);
CREATE INDEX idx_checker_language ON checker (language, id);
-- Documents table indexes
CREATE INDEX idx_documents_filename ON documents (filename, id);
CREATE INDEX idx_documents_create_datetime ON documents (create_datetime, id);
CREATE INDEX idx_documents_modified_datetime ON documents (modified_datetime, id);