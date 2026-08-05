// @generated automatically by Diesel CLI.

diesel::table! {
    checker (id) {
        id -> Text,
        kind -> Text,
        scope -> Text,
        owner_problem_id -> Nullable<Text>,
        name -> Text,
        description -> Nullable<Text>,
        language -> Nullable<Text>,
        document_id -> Nullable<Text>,
        create_datetime -> Timestamp,
        modified_datetime -> Timestamp,
    }
}

diesel::table! {
    checker_self_tests (id) {
        id -> Text,
        checker_id -> Text,
        name -> Text,
        expected_verdict -> Text,
        input -> Text,
        output -> Text,
        answer -> Text,
    }
}

diesel::table! {
    documents (id) {
        id -> Text,
        create_datetime -> Timestamp,
        modified_datetime -> Timestamp,
        filename -> Text,
    }
}

diesel::table! {
    problems (id) {
        id -> Text,
        name -> Text,
        url -> Nullable<Text>,
        group -> Text,
        statement -> Nullable<Text>,
        create_datetime -> Timestamp,
        modified_datetime -> Timestamp,
        time_limit -> Integer,
        memory_limit -> Integer,
    }
}

diesel::table! {
    problem_checker (problem_id) {
        problem_id -> Text,
        checker_id -> Text,
    }
}

diesel::table! {
    solutions (id) {
        id -> Text,
        author -> Text,
        name -> Text,
        language -> Text,
        problem_id -> Text,
        document_id -> Text,
    }
}

diesel::table! {
    test_cases (id) {
        id -> Text,
        problem_id -> Text,
        input_document_id -> Text,
        answer_document_id -> Text,
    }
}

diesel::joinable!(checker -> problems (owner_problem_id));
diesel::joinable!(checker_self_tests -> checker (checker_id));
diesel::joinable!(problem_checker -> checker (checker_id));
diesel::joinable!(problem_checker -> problems (problem_id));
diesel::joinable!(solutions -> problems (problem_id));
diesel::joinable!(test_cases -> problems (problem_id));

diesel::allow_tables_to_appear_in_same_query!(
    checker,
    checker_self_tests,
    documents,
    problem_checker,
    problems,
    solutions,
    test_cases,
);
