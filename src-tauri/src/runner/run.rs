use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};

use anyhow::Result;
use log::trace;
use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::{
    fs::File,
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader, BufWriter},
    time::Instant,
};

use crate::runner::command_flag_hide_new_console;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProgramSimpleOutput {
    exit_code: i32,
    stdout: String,
    stderr: String,
    is_timeout: bool,
}

pub async fn launch_program_without_input(
    mut cmd: Command,
    timeout_millis: u128,
) -> Result<ProgramSimpleOutput> {
    command_flag_hide_new_console(&mut cmd);
    let mut cmd = tokio::process::Command::from(cmd);
    cmd.kill_on_drop(true)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .stdin(Stdio::piped());
    trace!("spawn program: {:?}", &cmd);
    let mut child = cmd.spawn()?;
    let pid = child.id().unwrap_or(0);
    trace!("pid: {}", pid);
    let mut stdout_reader = BufReader::new(child.stdout.take().unwrap());
    let mut stderr_reader = BufReader::new(child.stderr.take().unwrap());

    let wait_for_process = async {
        match tokio::time::timeout(
            Duration::from_millis(timeout_millis as u64),
            child.wait(),
        )
        .await
        {
            Ok(status) => {
                trace!("program exited");
                std::io::Result::Ok((status?, false))
            }
            Err(_) => {
                trace!("timeout! kill process {}", pid);
                child.kill().await?;
                std::io::Result::Ok((child.wait().await?, true))
            }
        }
    };
    let read_stdout = async {
        let mut stdout = String::new();
        let size = stdout_reader.read_to_string(&mut stdout).await?;
        std::io::Result::Ok((stdout, size))
    };
    let read_stderr = async {
        let mut stderr = String::new();
        let size = stderr_reader.read_to_string(&mut stderr).await?;
        std::io::Result::Ok((stderr, size))
    };

    let (status_result, stdout_result, stderr_result) =
        tokio::join!(wait_for_process, read_stdout, read_stderr);
    let (status, is_timeout) = status_result?;
    let (stdout, stdout_sz) = stdout_result?;
    let (stderr, stderr_sz) = stderr_result?;
    let exit_code = status.code().unwrap_or(-1);
    trace!("process {} exit code: {}", pid, exit_code);
    trace!(
        "collected program {} output: stdout: {} bytes, stderr: {} bytes",
        pid,
        stdout_sz,
        stderr_sz
    );

    Ok(ProgramSimpleOutput {
        exit_code,
        stdout,
        stderr,
        is_timeout,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum ProgramOutput {
    Full {
        exit_code: i32,
        is_timeout: bool,
        content: String,
        output_file: PathBuf,
    },
    Strip {
        exit_code: i32,
        size: u32,
        is_timeout: bool,
        content: String,
        output_file: PathBuf,
    },
}

pub async fn launch_program<
    P: AsRef<Path>,
    S: AsRef<Path>,
    C1: FnMut(&str) -> (),
    C2: FnMut(&str) -> (),
>(
    mut cmd: Command,
    input: P,
    output_file: S,
    timeout_millis: u128,
    mut stdout_line_callback: C1,
    mut stderr_line_callback: C2,
) -> Result<ProgramOutput> {
    command_flag_hide_new_console(&mut cmd);
    let mut cmd = tokio::process::Command::from(cmd);
    cmd.kill_on_drop(true)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .stdin(Stdio::piped());
    trace!("spawn program: {:?}", &cmd);
    let mut child = cmd.spawn()?;
    let pid = child.id().unwrap_or(0);
    trace!("pid: {}", pid);
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    {
        let mut stdin = child.stdin.take().unwrap();

        let mut input_reader = File::open(input.as_ref()).await?;
        let mut buffer = [0u8; 8];
        let mut input_sz = 0;
        while let Ok(n) = input_reader.read(&mut buffer).await {
            if n == 0 {
                break;
            }
            input_sz += n as u64;
            stdin.write_all(&buffer[..n]).await?;
        }
        stdin.flush().await?;
        stdin.shutdown().await?;
        trace!("redirect input {} bytes to process {}", input_sz, pid);
    }

    let mut stdout_stream = BufReader::new(stdout).lines();
    let mut stderr_stream = BufReader::new(stderr).lines();
    let parent = output_file.as_ref().parent();
    if let Some(p) = parent {
        if !p.exists() {
            tokio::fs::create_dir_all(p).await?;
        }
    }
    let mut output_file_writer = BufWriter::new(File::create(output_file.as_ref()).await?);
    let start_time = Instant::now();
    let mut is_timeout = false;
    let mut is_stdout_eof = false;
    let mut is_stderr_eof = false;
    loop {
        if is_stdout_eof && is_stderr_eof {
            trace!("program {} stdout and stderr are all EOF", pid);
            break;
        }
        tokio::select! {
            Ok(res) = stdout_stream.next_line(),if !is_stdout_eof => {
                if let Some(line) = res {
                    trace!("program {} stdout -> {}", pid, line);
                    stdout_line_callback(&line);
                    output_file_writer.write_all(line.as_bytes()).await?;
                    output_file_writer.write_all(b"\n").await?;
                }else{
                    trace!("program {} stdout is EOF", pid);
                    is_stdout_eof = true;
                }
            },
            Ok(res) = stderr_stream.next_line(),if !is_stderr_eof => {
                if let Some(line) = res {
                    trace!("program {} stderr -> {}", pid, line);
                    stderr_line_callback(&line);
                }else{
                    trace!("program {} stderr is EOF", pid);
                    is_stderr_eof = true;
                }
            },
            _ = tokio::time::sleep(Duration::from_millis(200)) => {
                let elapsed = start_time.elapsed();
                if elapsed.as_millis() > timeout_millis {
                    is_timeout = true;
                    trace!("program {} timeout! killing process", pid);
                    child.kill().await?;
                    break;
                }
            }
        }
    }
    output_file_writer.flush().await?;
    output_file_writer.shutdown().await?;
    let exit_code = child.wait().await?.code().unwrap_or(-1);
    trace!("program {} exit code: {}", pid, exit_code);
    let filesize = tokio::fs::metadata(output_file.as_ref()).await?.len();
    trace!("program {} output file size: {} bytes", pid, filesize);
    if filesize > 5 * 1024 * 1024 {
        // file is greater than 5MiB
        let file = tokio::fs::File::open(output_file.as_ref()).await?;
        let mut content = String::with_capacity(5 * 1024 * 1024);
        file.take(5 * 1024 * 1024)
            .read_to_string(&mut content)
            .await?;
        Ok(ProgramOutput::Strip {
            exit_code,
            size: filesize as u32,
            is_timeout,
            content,
            output_file: output_file.as_ref().to_path_buf(),
        })
    } else {
        let content = tokio::fs::read_to_string(output_file.as_ref()).await?;
        Ok(ProgramOutput::Full {
            exit_code,
            is_timeout,
            content,
            output_file: output_file.as_ref().to_path_buf(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_dir() -> PathBuf {
        std::env::temp_dir().join(format!("algorimejo-runner-test-{}", uuid::Uuid::new_v4()))
    }

    #[cfg(windows)]
    fn input_echo_command() -> Command {
        let mut command = Command::new("cmd.exe");
        command.args([
            "/D",
            "/V:ON",
            "/S",
            "/C",
            "set /p input=& echo stdout:!input!& echo stderr:!input!>&2",
        ]);
        command
    }

    #[cfg(unix)]
    fn input_echo_command() -> Command {
        let mut command = Command::new("sh");
        command.args([
            "-c",
            "IFS= read -r input; printf 'stdout:%s\\n' \"$input\"; printf 'stderr:%s\\n' \"$input\" >&2",
        ]);
        command
    }

    #[cfg(windows)]
    fn large_output_command() -> Command {
        let mut command = Command::new("cmd.exe");
        command.args([
            "/D",
            "/S",
            "/C",
            "for /L %i in (1,1,10000) do @echo 1234567890",
        ]);
        command
    }

    #[cfg(unix)]
    fn large_output_command() -> Command {
        let mut command = Command::new("sh");
        command.args([
            "-c",
            "i=0; while [ $i -lt 10000 ]; do echo 1234567890; i=$((i + 1)); done",
        ]);
        command
    }

    #[cfg(windows)]
    fn endless_command() -> Command {
        let mut command = Command::new("cmd.exe");
        command.args(["/D", "/S", "/C", "for /L %i in (1,0,2) do @rem"]);
        command
    }

    #[cfg(unix)]
    fn endless_command() -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", "while :; do :; done"]);
        command
    }

    #[tokio::test]
    async fn launch_program_redirects_input_and_captures_output() {
        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("input.txt");
        let output = dir.join("output.txt");
        fs::write(&input, "hello\n").unwrap();
        let mut stdout_lines = Vec::new();
        let mut stderr_lines = Vec::new();

        let result = launch_program(
            input_echo_command(),
            &input,
            &output,
            5_000,
            |line| stdout_lines.push(line.to_string()),
            |line| stderr_lines.push(line.to_string()),
        )
        .await
        .unwrap();

        assert_eq!(stdout_lines, ["stdout:hello"]);
        assert_eq!(stderr_lines, ["stderr:hello"]);
        assert_eq!(fs::read_to_string(&output).unwrap(), "stdout:hello\n");
        assert!(matches!(
            result,
            ProgramOutput::Full {
                exit_code: 0,
                is_timeout: false,
                ..
            }
        ));
        fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn launch_program_without_input_drains_large_output() {
        let result = launch_program_without_input(large_output_command(), 5_000)
            .await
            .unwrap();

        assert!(!result.is_timeout);
        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.len() >= 100_000);
    }

    #[tokio::test]
    async fn launch_program_without_input_kills_timed_out_process() {
        let result = launch_program_without_input(endless_command(), 100)
            .await
            .unwrap();

        assert!(result.is_timeout);
        assert_ne!(result.exit_code, 0);
    }
}
