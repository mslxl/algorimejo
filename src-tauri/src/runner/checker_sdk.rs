use std::path::{Path, PathBuf};

use crate::database::language::LanguageBase;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use specta::Type;

const CPP_TESTLIB: &[u8] = include_bytes!("../../../3rd_party/testlib/include/testlib.h");

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckerSdkInfo {
    pub source_filename: String,
    pub template: String,
    pub documentation: String,
}

const PYTHON_SDK: &str = r#"import sys

class TokenStream:
    def __init__(self, path):
        self.path = path
        with open(path, "r", encoding="utf-8") as stream:
            self.content = stream.read()
        self.tokens = self.content.split()
        self.index = 0

    def read_token(self):
        if self.index >= len(self.tokens):
            raise ValueError(f"Unexpected end of file: {self.path}")
        value = self.tokens[self.index]
        self.index += 1
        return value

    def read_int(self):
        return int(self.read_token())

    def read_float(self):
        return float(self.read_token())

    def has_more(self):
        return self.index < len(self.tokens)

    def expect_eof(self):
        if self.index != len(self.tokens):
            raise ValueError(f"Unexpected trailing token: {self.tokens[self.index]}")

class Checker:
    def __init__(self, input_path, output_path, answer_path):
        self.input = TokenStream(input_path)
        self.output = TokenStream(output_path)
        self.answer = TokenStream(answer_path)

    @classmethod
    def from_argv(cls):
        if len(sys.argv) != 4:
            cls.fail("Expected arguments: <input> <output> <answer>")
        return cls(sys.argv[1], sys.argv[2], sys.argv[3])

    @staticmethod
    def _quit(code, message):
        print(message, file=sys.stderr)
        raise SystemExit(code)

    @classmethod
    def accept(cls, message="Accepted"):
        cls._quit(0, message)

    @classmethod
    def wrong_answer(cls, message="Wrong answer"):
        cls._quit(1, message)

    @classmethod
    def presentation_error(cls, message="Presentation error"):
        cls._quit(2, message)

    @classmethod
    def fail(cls, message="Checker failed"):
        cls._quit(3, message)
"#;

const JAVASCRIPT_SDK: &str = r#"import fs from "node:fs";

export class TokenStream {
  constructor(path) {
    this.path = path;
    this.tokens = fs.readFileSync(path, "utf8").split(/\s+/).filter(Boolean);
    this.index = 0;
  }
  readToken() {
    if (this.index >= this.tokens.length) throw new Error(`Unexpected end of file: ${this.path}`);
    return this.tokens[this.index++];
  }
  readInt() { return Number.parseInt(this.readToken(), 10); }
  readFloat() { return Number.parseFloat(this.readToken()); }
  hasMore() { return this.index < this.tokens.length; }
  expectEof() {
    if (this.index !== this.tokens.length) throw new Error(`Unexpected trailing token: ${this.tokens[this.index]}`);
  }
}

export class Checker {
  constructor(inputPath, outputPath, answerPath) {
    this.input = new TokenStream(inputPath);
    this.output = new TokenStream(outputPath);
    this.answer = new TokenStream(answerPath);
  }
  static fromArgv(argv = process.argv.slice(2)) {
    if (argv.length !== 3) Checker.fail("Expected arguments: <input> <output> <answer>");
    return new Checker(argv[0], argv[1], argv[2]);
  }
  static quit(code, message) { console.error(message); process.exit(code); }
  static accept(message = "Accepted") { Checker.quit(0, message); }
  static wrongAnswer(message = "Wrong answer") { Checker.quit(1, message); }
  static presentationError(message = "Presentation error") { Checker.quit(2, message); }
  static fail(message = "Checker failed") { Checker.quit(3, message); }
}
"#;

const TYPESCRIPT_SDK: &str = r#"/// <reference path="./node-shim.d.ts" />
import fs from "node:fs";

export class TokenStream {
  private readonly tokens: string[];
  private index = 0;
  constructor(private readonly path: string) {
    this.tokens = fs.readFileSync(path, "utf8").split(/\s+/).filter(Boolean);
  }
  readToken(): string {
    const value = this.tokens[this.index++];
    if (value === undefined) throw new Error(`Unexpected end of file: ${this.path}`);
    return value;
  }
  readInt(): number { return Number.parseInt(this.readToken(), 10); }
  readFloat(): number { return Number.parseFloat(this.readToken()); }
  hasMore(): boolean { return this.index < this.tokens.length; }
  expectEof(): void {
    if (this.index !== this.tokens.length) throw new Error(`Unexpected trailing token: ${this.tokens[this.index]}`);
  }
}

export class Checker {
  readonly input: TokenStream;
  readonly output: TokenStream;
  readonly answer: TokenStream;
  constructor(inputPath: string, outputPath: string, answerPath: string) {
    this.input = new TokenStream(inputPath);
    this.output = new TokenStream(outputPath);
    this.answer = new TokenStream(answerPath);
  }
  static fromArgv(argv: string[] = process.argv.slice(2)): Checker {
    if (argv.length !== 3) Checker.fail("Expected arguments: <input> <output> <answer>");
    return new Checker(argv[0]!, argv[1]!, argv[2]!);
  }
  private static quit(code: number, message: string): never { console.error(message); process.exit(code); }
  static accept(message = "Accepted"): never { return Checker.quit(0, message); }
  static wrongAnswer(message = "Wrong answer"): never { return Checker.quit(1, message); }
  static presentationError(message = "Presentation error"): never { return Checker.quit(2, message); }
  static fail(message = "Checker failed"): never { return Checker.quit(3, message); }
}
"#;

const TYPESCRIPT_NODE_SHIM: &str = r#"declare module "node:fs" {
  interface FileSystem {
    readFileSync(path: string, encoding: "utf8"): string;
  }
  const fs: FileSystem;
  export default fs;
}

declare const process: {
  argv: string[];
  exit(code?: number): never;
};
"#;

const GO_SDK: &str = r#"package testlib

import (
    "fmt"
    "os"
    "strconv"
    "strings"
)

type TokenStream struct { path string; tokens []string; index int }

func Open(path string) (*TokenStream, error) {
    content, err := os.ReadFile(path)
    if err != nil { return nil, err }
    return &TokenStream{path: path, tokens: strings.Fields(string(content))}, nil
}
func (s *TokenStream) ReadToken() (string, error) {
    if s.index >= len(s.tokens) { return "", fmt.Errorf("unexpected end of file: %s", s.path) }
    value := s.tokens[s.index]; s.index++; return value, nil
}
func (s *TokenStream) ReadInt() (int64, error) { value, err := s.ReadToken(); if err != nil { return 0, err }; return strconv.ParseInt(value, 10, 64) }
func (s *TokenStream) ReadFloat() (float64, error) { value, err := s.ReadToken(); if err != nil { return 0, err }; return strconv.ParseFloat(value, 64) }
func (s *TokenStream) HasMore() bool { return s.index < len(s.tokens) }
func (s *TokenStream) ExpectEOF() error { if s.index != len(s.tokens) { return fmt.Errorf("unexpected trailing token: %s", s.tokens[s.index]) }; return nil }

type Checker struct { Input, Output, Answer *TokenStream }
func FromArgs(args []string) (*Checker, error) {
    if len(args) != 3 { return nil, fmt.Errorf("expected arguments: <input> <output> <answer>") }
    input, err := Open(args[0]); if err != nil { return nil, err }
    output, err := Open(args[1]); if err != nil { return nil, err }
    answer, err := Open(args[2]); if err != nil { return nil, err }
    return &Checker{Input: input, Output: output, Answer: answer}, nil
}
func quit(code int, message string) { fmt.Fprintln(os.Stderr, message); os.Exit(code) }
func Accept(message string) { quit(0, message) }
func WrongAnswer(message string) { quit(1, message) }
func PresentationError(message string) { quit(2, message) }
func Fail(message string) { quit(3, message) }
"#;

pub fn sdk_info(base: LanguageBase) -> Result<CheckerSdkInfo> {
    let common_docs = r#"# Checker SDK

Algorimejo places the SDK beside the Checker source. It is bundled with the app and never installs a package globally.

## Process contract

The Checker receives exactly three file paths:

1. Problem input
2. Contestant output
3. Expected answer

Exit codes map to verdicts: 0 = AC, 1 = WA, 2 = PE, and 3 = Checker failure. A crash, timeout, or any other exit code is reported as a Checker runtime error.

Write the verdict explanation to standard error. It is shown in self-tests and beside the problem test result.

## Token streams

Input, output, and answer streams read UTF-8, whitespace-delimited tokens. Numeric readers parse one token. Check whether a stream has another token before paired reads, then perform an EOF check on contestant output to reject trailing data.

Malformed expected answers normally indicate a Checker failure. A mismatched or prematurely-ended contestant output normally indicates WA. Extra contestant tokens normally indicate PE.

## Workflow

Use Self Tests for at least AC, WA, and trailing-output cases. Build Output contains compiler diagnostics and reports whether the content-addressed build cache was used. Changing source, language configuration, or SDK version creates a fresh build.
"#;
    let info = match base {
        LanguageBase::Cpp => CheckerSdkInfo {
            source_filename: "checker.cpp".to_string(),
            template: r#"#include "testlib.h"

int main(int argc, char* argv[]) {
    registerTestlibCmd(argc, argv);

    while (!ans.seekEof() && !ouf.seekEof()) {
        const std::string expected = ans.readToken();
        const std::string actual = ouf.readToken();
        if (actual != expected)
            quitf(_wa, "expected '%s', found '%s'", expected.c_str(), actual.c_str());
    }
    if (!ans.seekEof())
        quitf(_wa, "contestant output ended early");
    if (!ouf.seekEof())
        quitf(_pe, "unexpected trailing output");
    quitf(_ok, "all tokens match");
}
"#.to_string(),
            documentation: format!("{}\n## C++ API\n\nThe workspace includes the official `testlib.h`; testlib does not need to be installed separately. `registerTestlibCmd(argc, argv)` initializes `inf`, `ouf`, and `ans`. Use `readToken`, `readInt`, `readDouble`, `seekEof`, and `quitf`. Verdict constants are `_ok`, `_wa`, `_pe`, and `_fail`.\n", common_docs),
        },
        LanguageBase::Python => CheckerSdkInfo {
            source_filename: "checker.py".to_string(),
            template: r#"from algorimejo_testlib import Checker

checker = Checker.from_argv()

while checker.answer.has_more():
    expected = checker.answer.read_token()
    if not checker.output.has_more():
        Checker.wrong_answer("Contestant output ended early")
    actual = checker.output.read_token()
    if actual != expected:
        Checker.wrong_answer(f"Expected {expected!r}, found {actual!r}")

try:
    checker.output.expect_eof()
except ValueError as error:
    Checker.presentation_error(str(error))
Checker.accept("All tokens match")
"#.to_string(),
            documentation: format!("{}\n## Python API\n\n`from algorimejo_testlib import Checker` loads the local single-file SDK. `Checker.from_argv()` creates `input`, `output`, and `answer` streams. Streams expose `has_more()`, `read_token()`, `read_int()`, `read_float()`, and `expect_eof()`. Finish with `Checker.accept`, `wrong_answer`, `presentation_error`, or `fail`.\n", common_docs),
        },
        LanguageBase::JavaScript => CheckerSdkInfo {
            source_filename: "checker.js".to_string(),
            template: r#"import { Checker } from "./algorimejo_testlib.mjs";

const checker = Checker.fromArgv();
while (checker.answer.hasMore()) {
  const expected = checker.answer.readToken();
  if (!checker.output.hasMore()) Checker.wrongAnswer("Contestant output ended early");
  const actual = checker.output.readToken();
  if (actual !== expected) Checker.wrongAnswer(`Expected ${expected}, found ${actual}`);
}
try { checker.output.expectEof(); } catch (error) { Checker.presentationError(String(error)); }
Checker.accept("All tokens match");
"#.to_string(),
            documentation: format!("{}\n## JavaScript API\n\n`import {{ Checker }} from \"./algorimejo_testlib.mjs\"` loads the local ES module. `Checker.fromArgv()` creates `input`, `output`, and `answer` streams. Streams expose `hasMore()`, `readToken()`, `readInt()`, `readFloat()`, and `expectEof()`. Finish with `Checker.accept`, `wrongAnswer`, `presentationError`, or `fail`. A local `package.json` selects ESM mode; npm is not used.\n", common_docs),
        },
        LanguageBase::TypeScript => CheckerSdkInfo {
            source_filename: "checker.ts".to_string(),
            template: r#"import { Checker } from "./algorimejo_testlib.js";

const checker = Checker.fromArgv();
while (checker.answer.hasMore()) {
  const expected = checker.answer.readToken();
  if (!checker.output.hasMore()) Checker.wrongAnswer("Contestant output ended early");
  const actual = checker.output.readToken();
  if (actual !== expected) Checker.wrongAnswer(`Expected ${expected}, found ${actual}`);
}
try { checker.output.expectEof(); } catch (error) { Checker.presentationError(String(error)); }
Checker.accept("All tokens match");
"#.to_string(),
            documentation: format!("{}\n## TypeScript API\n\n`import {{ Checker }} from \"./algorimejo_testlib.js\"` resolves to the local typed SDK and emits a valid Node ESM import. The workspace includes `node-shim.d.ts`, `tsconfig.json`, and `package.json`; no `@types/node` or npm install is required. Streams expose `hasMore()`, `readToken()`, `readInt()`, `readFloat()`, and `expectEof()`. Finish with `Checker.accept`, `wrongAnswer`, `presentationError`, or `fail`.\n", common_docs),
        },
        LanguageBase::Go => CheckerSdkInfo {
            source_filename: "checker.go".to_string(),
            template: r#"package main

import (
    "fmt"
    "os"
    "algorimejo/checker/testlib"
)

func main() {
    checker, err := testlib.FromArgs(os.Args[1:])
    if err != nil { testlib.Fail(err.Error()) }
    for checker.Answer.HasMore() {
        expected, _ := checker.Answer.ReadToken()
        if !checker.Output.HasMore() { testlib.WrongAnswer("contestant output ended early") }
        actual, _ := checker.Output.ReadToken()
        if actual != expected { testlib.WrongAnswer(fmt.Sprintf("expected %q, found %q", expected, actual)) }
    }
    if err := checker.Output.ExpectEOF(); err != nil { testlib.PresentationError(err.Error()) }
    testlib.Accept("all tokens match")
}
"#.to_string(),
            documentation: format!("{}\n## Go API\n\nImport `algorimejo/checker/testlib`, a local module generated beside the source. `testlib.FromArgs(os.Args[1:])` creates `Input`, `Output`, and `Answer` streams. Streams expose `HasMore`, `ReadToken`, `ReadInt`, `ReadFloat`, and `ExpectEOF`. Finish with `testlib.Accept`, `WrongAnswer`, `PresentationError`, or `Fail`. The local `go.mod` requires no downloaded module.\n", common_docs),
        },
        _ => return Err(anyhow!("Unsupported checker language: {:?}", base)),
    };
    Ok(info)
}

pub async fn materialize_sdk(base: LanguageBase, directory: &Path) -> Result<()> {
    tokio::fs::create_dir_all(directory).await?;
    match base {
        LanguageBase::Cpp => {
            tokio::fs::write(directory.join("testlib.h"), CPP_TESTLIB).await?;
        }
        LanguageBase::Python => {
            tokio::fs::write(directory.join("algorimejo_testlib.py"), PYTHON_SDK).await?;
        }
        LanguageBase::JavaScript => {
            tokio::fs::write(directory.join("algorimejo_testlib.mjs"), JAVASCRIPT_SDK).await?;
            tokio::fs::write(directory.join("package.json"), "{\"type\":\"module\"}\n").await?;
        }
        LanguageBase::TypeScript => {
            tokio::fs::write(directory.join("algorimejo_testlib.ts"), TYPESCRIPT_SDK).await?;
            tokio::fs::write(directory.join("node-shim.d.ts"), TYPESCRIPT_NODE_SHIM).await?;
            tokio::fs::write(
                directory.join("tsconfig.json"),
                "{\"compilerOptions\":{\"module\":\"NodeNext\",\"moduleResolution\":\"NodeNext\",\"target\":\"ES2022\",\"strict\":true,\"skipLibCheck\":true},\"include\":[\"*.ts\"]}\n",
            )
            .await?;
            tokio::fs::write(directory.join("package.json"), "{\"type\":\"module\"}\n").await?;
        }
        LanguageBase::Go => {
            let package = directory.join("testlib");
            tokio::fs::create_dir_all(&package).await?;
            tokio::fs::write(package.join("testlib.go"), GO_SDK).await?;
            tokio::fs::write(
                directory.join("go.mod"),
                "module algorimejo/checker\n\ngo 1.20\n",
            )
            .await?;
        }
        _ => return Err(anyhow!("Unsupported checker language: {:?}", base)),
    }
    Ok(())
}

pub fn source_path(directory: &Path, base: LanguageBase) -> Result<PathBuf> {
    Ok(directory.join(sdk_info(base)?.source_filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn templates_check_for_missing_and_trailing_output() {
        for base in [
            LanguageBase::Python,
            LanguageBase::JavaScript,
            LanguageBase::TypeScript,
            LanguageBase::Go,
        ] {
            let info = sdk_info(base).unwrap();
            assert!(info.template.contains("ended early"));
            assert!(info.template.to_lowercase().contains("eof"));
        }

        let javascript = sdk_info(LanguageBase::JavaScript).unwrap();
        assert!(javascript.template.contains("answer.hasMore()"));
        assert!(javascript.template.contains("output.hasMore()"));

        let typescript = sdk_info(LanguageBase::TypeScript).unwrap();
        assert!(typescript.template.contains("./algorimejo_testlib.js"));
    }

    #[test]
    fn unsupported_languages_are_rejected() {
        assert!(sdk_info(LanguageBase::Text).is_err());
        assert!(sdk_info(LanguageBase::Unknown).is_err());
    }
}
