DROP TRIGGER IF EXISTS update_checker_modified_time;
DROP TRIGGER IF EXISTS validate_problem_checker_update;
DROP TRIGGER IF EXISTS validate_problem_checker_insert;
DROP TABLE checker_self_tests;
DROP TABLE problem_checker;
DROP TABLE checker;

ALTER TABLE problems ADD COLUMN checker TEXT NULL;

CREATE TABLE checker (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    description TEXT NULL,
    document_id TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
);

CREATE INDEX idx_checker_name ON checker (name, id);
CREATE INDEX idx_checker_language ON checker (language, id);
