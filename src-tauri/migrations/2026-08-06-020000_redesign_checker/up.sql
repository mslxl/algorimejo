DROP TABLE checker;

ALTER TABLE problems DROP COLUMN checker;

CREATE TABLE checker (
    id TEXT NOT NULL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('builtin', 'custom')),
    scope TEXT NOT NULL CHECK (scope IN ('global', 'problem')),
    owner_problem_id TEXT NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    language TEXT NULL,
    document_id TEXT NULL UNIQUE,
    create_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (kind = 'builtin' AND scope = 'global' AND owner_problem_id IS NULL AND language IS NULL AND document_id IS NULL)
        OR
        (kind = 'custom' AND language IS NOT NULL AND document_id IS NOT NULL AND (
            (scope = 'global' AND owner_problem_id IS NULL)
            OR (scope = 'problem' AND owner_problem_id IS NOT NULL)
        ))
    ),
    FOREIGN KEY (owner_problem_id) REFERENCES problems (id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents (id)
);

CREATE TABLE problem_checker (
    problem_id TEXT NOT NULL PRIMARY KEY,
    checker_id TEXT NOT NULL,
    FOREIGN KEY (problem_id) REFERENCES problems (id) ON DELETE CASCADE,
    FOREIGN KEY (checker_id) REFERENCES checker (id) ON DELETE RESTRICT
);

CREATE TABLE checker_self_tests (
    id TEXT NOT NULL PRIMARY KEY,
    checker_id TEXT NOT NULL,
    name TEXT NOT NULL,
    expected_verdict TEXT NOT NULL CHECK (expected_verdict IN ('AC', 'WA', 'PE', 'CHKRE')),
    input TEXT NOT NULL DEFAULT '',
    output TEXT NOT NULL DEFAULT '',
    answer TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (checker_id) REFERENCES checker (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_checker_global_name
ON checker (name) WHERE scope = 'global';

CREATE UNIQUE INDEX idx_checker_problem_name
ON checker (owner_problem_id, name) WHERE scope = 'problem';

CREATE INDEX idx_checker_owner_problem ON checker (owner_problem_id);
CREATE INDEX idx_problem_checker_checker ON problem_checker (checker_id);
CREATE INDEX idx_checker_self_tests_checker ON checker_self_tests (checker_id);

CREATE TRIGGER validate_problem_checker_insert
BEFORE INSERT ON problem_checker
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM checker
            WHERE id = NEW.checker_id
              AND (scope = 'global' OR owner_problem_id = NEW.problem_id)
        )
        THEN RAISE(ABORT, 'checker is not visible to this problem')
    END;
END;

CREATE TRIGGER validate_problem_checker_update
BEFORE UPDATE OF checker_id, problem_id ON problem_checker
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM checker
            WHERE id = NEW.checker_id
              AND (scope = 'global' OR owner_problem_id = NEW.problem_id)
        )
        THEN RAISE(ABORT, 'checker is not visible to this problem')
    END;
END;

CREATE TRIGGER update_checker_modified_time
AFTER UPDATE ON checker FOR EACH ROW BEGIN
    UPDATE checker
    SET modified_datetime = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
