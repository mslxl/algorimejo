// @generated automatically by Diesel CLI.

diesel::table! {
    checker (id) {
        id -> Text,
        name -> Text,
        language -> Text,
        description -> Nullable<Text>,
        document_id -> Text,
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
        description -> Text,
        statement -> Nullable<Text>,
        checker -> Text,
        create_datetime -> Timestamp,
        modified_datetime -> Timestamp,
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

diesel::joinable!(checker -> documents (document_id));
diesel::joinable!(solutions -> problems (problem_id));
diesel::joinable!(test_cases -> problems (problem_id));

diesel::allow_tables_to_appear_in_same_query!(checker, documents, problems, solutions, test_cases,);
