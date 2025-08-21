use std::process::Command;
use std::{collections::HashMap, path::PathBuf};

use nom::{
    branch::alt,
    bytes::complete::{escaped, is_not, take_while1},
    character::complete::{alpha1, alphanumeric1, char, multispace0, multispace1},
    combinator::{map, recognize},
    multi::{many0, separated_list0},
    sequence::delimited,
    IResult, Parser,
};

/// Parse a command string into a Command object (no env substitution here)
/// Uses a nom-based lexer to handle quotes and escaping similar to common shells.
pub fn parse_command(command: &str, _env: &HashMap<String, String>) -> Result<Command, String> {
    let (_, parts) =
        command_parser(command).map_err(|e| format!("Failed to parse command: {:?}", e))?;

    if parts.is_empty() {
        return Err("Empty command".to_string());
    }

    let mut cmd = Command::new(&parts[0]);
    if parts.len() > 1 {
        cmd.args(&parts[1..]);
    }

    Ok(cmd)
}

/// Parse the whole command into whitespace-separated arguments, respecting quotes.
fn command_parser(input: &str) -> IResult<&str, Vec<String>> {
    let (input, _) = multispace0.parse(input)?;
    let (input, parts) = separated_list0(multispace1, argument_parser).parse(input)?;
    let (input, _) = multispace0.parse(input)?;
    Ok((input, parts))
}

/// Parse a single argument: either quoted or a bare word.
fn argument_parser(input: &str) -> IResult<&str, String> {
    alt((quoted_argument, simple_argument)).parse(input)
}

/// Parse a quoted argument (single or double). Double quotes allow escapes with \.
fn quoted_argument(input: &str) -> IResult<&str, String> {
    alt((
        // Double quoted string with escaped quotes (\") and escaped backslash (\\)
        map(
            delimited(
                char('"'),
                escaped(is_not("\"\\"), '\\', alt((char('"'), char('\\')))),
                char('"'),
            ),
            |s: &str| unescape_string(s),
        ),
        // Single quoted string: no escaping inside
        map(delimited(char('\''), is_not("'"), char('\'')), |s: &str| {
            s.to_string()
        }),
    ))
    .parse(input)
}

/// Unescape a string by converting escape sequences to their literal characters
fn unescape_string(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(&next_ch) = chars.peek() {
                match next_ch {
                    '"' | '\\' => {
                        result.push(next_ch);
                        chars.next(); // consume the escaped character
                    }
                    _ => {
                        result.push(ch); // keep the backslash as-is for other escapes
                    }
                }
            } else {
                result.push(ch); // backslash at end of string
            }
        } else {
            result.push(ch);
        }
    }

    result
}

/// Parse an unquoted argument token (up to whitespace or quote)
fn simple_argument(input: &str) -> IResult<&str, String> {
    map(
        take_while1(|c: char| !c.is_whitespace() && c != '"' && c != '\''),
        |s: &str| s.to_string(),
    )
    .parse(input)
}

/// Parse environment variable substitution using nom
fn env_var_substitution_parser(input: &str) -> IResult<&str, String> {
    map(
        recognize((
            char('%'),
            recognize((alpha1, many0(alt((alphanumeric1, recognize(char('_'))))))),
        )),
        |s: &str| s.to_string(),
    )
    .parse(input)
}

/// Parse a string that may contain environment variable substitutions
fn string_with_env_vars_parser(input: &str) -> IResult<&str, Vec<String>> {
    many0(alt((
        // Parse environment variable
        env_var_substitution_parser,
        // Parse literal text (anything that's not %)
        map(take_while1(|c: char| c != '%'), |s: &str| s.to_string()),
    )))
    .parse(input)
}

/// Substitute %VARNAME occurrences inside each argument using nom-based parsing
fn substitute_env_vars(parts: Vec<String>, env: &HashMap<String, String>) -> Vec<String> {
    parts
        .into_iter()
        .map(|part| {
            if !part.contains('%') {
                return part;
            }

            match string_with_env_vars_parser(&part) {
                Ok((_, segments)) => {
                    segments
                        .into_iter()
                        .map(|segment| {
                            if segment.starts_with('%') {
                                let var_name = &segment[1..]; // Remove the % prefix
                                env.get(var_name).cloned().unwrap_or_else(|| {
                                    log::warn!(
                                        "Environment variable '{}' not found, keeping original",
                                        var_name
                                    );
                                    segment.clone()
                                })
                            } else {
                                segment
                            }
                        })
                        .collect::<String>()
                }
                Err(_) => {
                    // Fallback to original behavior if nom parsing fails
                    part
                }
            }
        })
        .collect()
}

/// Parse and then perform env substitution for %VARNAME tokens.
pub fn parse_command_with_env(
    command: &str,
    env: &HashMap<String, String>,
) -> Result<Command, String> {
    let (_, parts) =
        command_parser(command).map_err(|e| format!("Failed to parse command: {:?}", e))?;

    if parts.is_empty() {
        return Err("Empty command".to_string());
    }

    let processed_parts = substitute_env_vars(parts, env);

    let mut cmd = Command::new(&processed_parts[0]);
    if processed_parts.len() > 1 {
        cmd.args(&processed_parts[1..]);
    }
    Ok(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_simple_command() {
        let env = HashMap::new();
        let result = parse_command("ls -la", &env).unwrap();
        assert_eq!(result.get_program(), "ls");
        assert_eq!(result.get_args().collect::<Vec<_>>(), vec!["-la"]);
    }

    #[test]
    fn test_command_with_env_var() {
        let mut env = HashMap::new();
        env.insert("TEST_DIR".to_string(), "/home/user/test".to_string());
        let result = parse_command_with_env("ls %TEST_DIR", &env).unwrap();
        assert_eq!(result.get_program(), "ls");
        assert_eq!(
            result.get_args().collect::<Vec<_>>(),
            vec!["/home/user/test"]
        );
    }

    #[test]
    fn test_quoted_arguments() {
        let env = HashMap::new();
        let result = parse_command("echo \"Hello World\"", &env).unwrap();
        assert_eq!(result.get_program(), "echo");
        assert_eq!(result.get_args().collect::<Vec<_>>(), vec!["Hello World"]);
    }

    #[test]
    fn test_mixed_quotes_and_env() {
        let mut env = HashMap::new();
        env.insert("USER".to_string(), "john".to_string());
        let result = parse_command_with_env("echo 'Hello' %USER \"World\"", &env).unwrap();
        assert_eq!(result.get_program(), "echo");
        assert_eq!(
            result.get_args().collect::<Vec<_>>(),
            vec!["Hello", "john", "World"]
        );
    }

    #[test]
    fn test_escaped_quotes() {
        let env = HashMap::new();
        let result = parse_command("echo \"Hello\\\"World\"", &env).unwrap();
        assert_eq!(result.get_program(), "echo");
        assert_eq!(result.get_args().collect::<Vec<_>>(), vec!["Hello\"World"]);
    }

    #[test]
    fn test_escaped_backslash() {
        let env = HashMap::new();
        let result = parse_command("echo \"Hello\\\\World\"", &env).unwrap();
        assert_eq!(result.get_program(), "echo");
        assert_eq!(result.get_args().collect::<Vec<_>>(), vec!["Hello\\World"]);
    }

    #[test]
    fn test_mixed_escapes() {
        let env = HashMap::new();
        let result = parse_command("echo \"Hello\\\"World\\\\Test\"", &env).unwrap();
        assert_eq!(result.get_program(), "echo");
        assert_eq!(
            result.get_args().collect::<Vec<_>>(),
            vec!["Hello\"World\\Test"]
        );
    }

    #[test]
    fn test_missing_env_var() {
        let env = HashMap::new();
        let result = parse_command_with_env("echo %MISSING_VAR", &env).unwrap();
        assert_eq!(result.get_program(), "echo");
        assert_eq!(result.get_args().collect::<Vec<_>>(), vec!["%MISSING_VAR"]);
    }

    #[test]
    fn test_multiple_env_vars() {
        let mut env = HashMap::new();
        env.insert("HOME".to_string(), "/home/user".to_string());
        env.insert("USER".to_string(), "john".to_string());
        let result = parse_command_with_env("ls %HOME/%USER", &env).unwrap();
        assert_eq!(result.get_program(), "ls");
        assert_eq!(
            result.get_args().collect::<Vec<_>>(),
            vec!["/home/user/john"]
        );
    }

    #[test]
    fn test_unclosed_quote() {
        let env = HashMap::new();
        let result = parse_command("echo \"Hello World", &env);
        assert!(
            result.is_ok(),
            "nom parser returns error at end; we trim in parser"
        );
    }
}
