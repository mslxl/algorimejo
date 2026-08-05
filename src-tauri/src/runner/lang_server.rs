/// Language Server Protocol (LSP) process manager
/// This module provides functionality to launch and communicate with language servers
/// using the Language Server Protocol over stdio.
use std::{
    process::{Command, ExitStatus, Stdio},
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, bail, Result};
use log::trace;
use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    process::Child,
    sync::Mutex,
};

use crate::runner::command_flag_hide_new_console;

const MAX_LSP_HEADER_SIZE: usize = 8 * 1024;
const MAX_LSP_MESSAGE_SIZE: usize = 64 * 1024 * 1024;
const MAX_LOGGED_STDERR_SIZE: usize = 64 * 1024;
const PROCESS_KILL_TIMEOUT: Duration = Duration::from_secs(2);

async fn terminate_child(child: &mut Child) -> Result<()> {
    if child.try_wait()?.is_some() {
        return Ok(());
    }

    if let Err(error) = child.start_kill() {
        if child.try_wait()?.is_none() {
            return Err(error.into());
        }
        return Ok(());
    }

    tokio::time::timeout(PROCESS_KILL_TIMEOUT, child.wait())
        .await
        .map_err(|_| anyhow!("timed out waiting for terminated language server"))??;
    Ok(())
}

async fn write_lsp_message<W>(writer: &mut W, data: &[u8]) -> Result<()>
where
    W: AsyncWrite + Unpin + ?Sized,
{
    let header = format!("Content-Length: {}\r\n\r\n", data.len());
    writer.write_all(header.as_bytes()).await?;
    writer.write_all(data).await?;
    writer.flush().await?;
    Ok(())
}

async fn read_lsp_message<R>(reader: &mut R) -> Result<Vec<u8>>
where
    R: AsyncRead + Unpin + ?Sized,
{
    let mut header = Vec::new();
    let mut byte = [0u8; 1];

    while !header.ends_with(b"\r\n\r\n") {
        reader.read_exact(&mut byte).await?;
        header.push(byte[0]);
        if header.len() > MAX_LSP_HEADER_SIZE {
            bail!("LSP header exceeds {MAX_LSP_HEADER_SIZE} bytes");
        }
    }

    let header = std::str::from_utf8(&header)?;
    let content_length = header
        .lines()
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.trim().eq_ignore_ascii_case("Content-Length"))
        .and_then(|(_, value)| value.trim().parse::<usize>().ok())
        .ok_or_else(|| anyhow!("Invalid Content-Length header"))?;

    if content_length > MAX_LSP_MESSAGE_SIZE {
        bail!("LSP message exceeds {MAX_LSP_MESSAGE_SIZE} bytes");
    }

    let mut buffer = vec![0u8; content_length];
    reader.read_exact(&mut buffer).await?;
    Ok(buffer)
}

async fn drain_language_server_stderr<R>(mut stderr: R, pid: u32)
where
    R: AsyncRead + Unpin,
{
    let mut buffer = [0u8; 8 * 1024];
    let mut logged = 0;
    loop {
        match stderr.read(&mut buffer).await {
            Ok(0) => return,
            Ok(read) => {
                if logged < MAX_LOGGED_STDERR_SIZE {
                    let log_size = read.min(MAX_LOGGED_STDERR_SIZE - logged);
                    let message = String::from_utf8_lossy(&buffer[..log_size]);
                    let message = message.trim_end_matches(['\r', '\n']);
                    if !message.is_empty() {
                        trace!("lsp stderr {}: {}", pid, message);
                    }
                    logged += log_size;
                    if logged == MAX_LOGGED_STDERR_SIZE {
                        trace!("lsp stderr {pid}: further output suppressed");
                    }
                }
            }
            Err(error) => {
                log::warn!("failed to read language server {pid} stderr: {error}");
                return;
            }
        }
    }
}

/// Represents a running language server process with stdio communication
/// This struct is designed to be shared across multiple threads safely
#[derive(Clone)]
pub struct LangServerProcess {
    proc: Arc<Mutex<Child>>,
    writer: Arc<Mutex<Box<dyn AsyncWrite + Unpin + Send>>>,
    reader: Arc<Mutex<Box<dyn AsyncRead + Unpin + Send>>>,
}

/// A handle for writing to the language server from a separate thread
#[derive(Clone)]
pub struct LangServerWriter {
    writer: Arc<Mutex<Box<dyn AsyncWrite + Unpin + Send>>>,
}

/// A handle for reading from the language server from a separate thread
pub struct LangServerReader {
    proc: Arc<Mutex<Child>>,
    reader: Arc<Mutex<Box<dyn AsyncRead + Unpin + Send>>>,
}

/// Supported I/O methods for language server communication
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub enum IOMethod {
    /// Use standard input/output for communication
    StdIO,
}

impl LangServerProcess {
    /// Launch a new language server process
    ///
    /// # Arguments
    /// * `command` - The command to execute the language server
    /// * `io_method` - The I/O method to use for communication
    ///
    /// # Returns
    /// * `Result<LangServerProcess>` - The running language server process or an error
    pub fn launch(mut command: Command, io_method: IOMethod) -> Result<LangServerProcess> {
        command_flag_hide_new_console(&mut command);
        let mut command = tokio::process::Command::from(command);
        command.kill_on_drop(true).stderr(Stdio::piped());
        trace!("Launching language server: {:?}", &command);

        let mut child = match io_method {
            IOMethod::StdIO => command
                .stdout(Stdio::piped())
                .stdin(Stdio::piped())
                .spawn()?,
        };

        let (reader, writer): (
            Box<dyn AsyncRead + Unpin + Send>,
            Box<dyn AsyncWrite + Unpin + Send>,
        ) = match io_method {
            IOMethod::StdIO => {
                let stdout = child
                    .stdout
                    .take()
                    .ok_or_else(|| anyhow!("language server stdout is unavailable"))?;
                let stdin = child
                    .stdin
                    .take()
                    .ok_or_else(|| anyhow!("language server stdin is unavailable"))?;
                (Box::new(stdout), Box::new(stdin))
            }
        };

        let pid = child
            .id()
            .ok_or_else(|| anyhow!("language server PID is unavailable"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("language server stderr is unavailable"))?;
        tokio::spawn(drain_language_server_stderr(stderr, pid));

        Ok(Self {
            proc: Arc::new(Mutex::new(child)),
            reader: Arc::new(Mutex::new(reader)),
            writer: Arc::new(Mutex::new(writer)),
        })
    }

    /// Create a writer handle that can be moved to a separate thread
    ///
    /// # Returns
    /// * `LangServerWriter` - A thread-safe writer handle
    pub fn create_writer(&self) -> LangServerWriter {
        LangServerWriter {
            writer: Arc::clone(&self.writer),
        }
    }

    /// Create a reader handle that can be moved to a separate thread
    ///
    /// # Returns
    /// * `LangServerReader` - A thread-safe reader handle
    pub fn create_reader(&self) -> LangServerReader {
        LangServerReader {
            reader: Arc::clone(&self.reader),
            proc: Arc::clone(&self.proc),
        }
    }

    /// Write raw bytes to the language server
    ///
    /// # Arguments
    /// * `data` - The bytes to send
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub async fn write(&self, data: &[u8]) -> Result<()> {
        let mut writer = self.writer.lock().await;
        write_lsp_message(writer.as_mut(), data).await
    }

    /// Read a complete LSP message from the language server
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - The message bytes or an error
    pub async fn read(&self) -> Result<Vec<u8>> {
        let mut reader = self.reader.lock().await;
        read_lsp_message(reader.as_mut()).await
    }

    /// Send a JSON message to the language server
    ///
    /// # Arguments
    /// * `message` - The JSON message string to send
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub async fn send_message(&self, message: &str) -> Result<()> {
        self.write(message.as_bytes()).await
    }

    /// Receive a JSON message from the language server
    ///
    /// # Returns
    /// * `Result<String>` - The received JSON message or an error
    pub async fn receive_message(&self) -> Result<String> {
        let data = self.read().await?;
        Ok(String::from_utf8(data)?)
    }

    /// Check if the language server process is still alive
    ///
    /// # Returns
    /// * `bool` - True if the process is still running
    pub async fn is_alive(&self) -> bool {
        let mut proc = self.proc.lock().await;
        proc.try_wait().unwrap_or(None).is_none()
    }

    pub async fn exit_code(&self) -> Option<i32> {
        let mut proc = self.proc.lock().await;
        proc.try_wait()
            .unwrap_or(None)
            .map(|status| status.code().unwrap_or(0))
    }

    pub async fn pid(&self) -> Option<u32> {
        let proc = self.proc.lock().await;
        proc.id()
    }

    pub async fn kill(&self) -> Result<()> {
        let mut proc = tokio::time::timeout(PROCESS_KILL_TIMEOUT, self.proc.lock())
            .await
            .map_err(|_| anyhow!("timed out acquiring language server process handle"))?;
        terminate_child(&mut proc).await
    }
}

impl LangServerWriter {
    /// Write raw bytes to the language server
    ///
    /// # Arguments
    /// * `data` - The bytes to send
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub async fn write(&self, data: &[u8]) -> Result<()> {
        let mut writer = self.writer.lock().await;
        write_lsp_message(writer.as_mut(), data).await
    }

    /// Send a JSON message to the language server
    ///
    /// # Arguments
    /// * `message` - The JSON message string to send
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub async fn send_message(&self, message: &str) -> Result<()> {
        self.write(message.as_bytes()).await
    }
}

impl LangServerReader {
    /// Read a complete LSP message from the language server
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - The message bytes or an error
    pub async fn read(&self) -> Result<Vec<u8>> {
        let mut reader = self.reader.lock().await;
        read_lsp_message(reader.as_mut()).await
    }

    /// Receive a JSON message from the language server
    ///
    /// # Returns
    /// * `Result<String>` - The received JSON message or an error
    pub async fn receive_message(&self) -> Result<String> {
        let data = self.read().await?;
        Ok(String::from_utf8(data)?)
    }

    pub async fn wait_for_exit(&self, grace_period: Duration) -> Result<ExitStatus> {
        let mut proc = tokio::time::timeout(PROCESS_KILL_TIMEOUT, self.proc.lock())
            .await
            .map_err(|_| anyhow!("timed out acquiring language server process handle"))?;
        match tokio::time::timeout(grace_period, proc.wait()).await {
            Ok(status) => Ok(status?),
            Err(_) => {
                terminate_child(&mut proc).await?;
                proc.try_wait()?
                    .ok_or_else(|| anyhow!("language server was not reaped after termination"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{duplex, AsyncWriteExt},
        time::timeout,
    };

    #[tokio::test]
    async fn reads_lsp_message() {
        let (mut writer, mut reader) = duplex(1024);
        writer
            .write_all(b"content-length: 13\r\n\r\n{\"jsonrpc\":2}")
            .await
            .unwrap();

        assert_eq!(
            read_lsp_message(&mut reader).await.unwrap(),
            b"{\"jsonrpc\":2}"
        );
    }

    #[tokio::test]
    async fn rejects_oversized_header() {
        let (mut writer, mut reader) = duplex(MAX_LSP_HEADER_SIZE + 16);
        writer
            .write_all(&vec![b'x'; MAX_LSP_HEADER_SIZE + 1])
            .await
            .unwrap();

        let error = read_lsp_message(&mut reader).await.unwrap_err();
        assert!(error.to_string().contains("header exceeds"));
    }

    #[tokio::test]
    async fn rejects_oversized_message_before_allocating_body() {
        let (mut writer, mut reader) = duplex(1024);
        let header = format!("Content-Length: {}\r\n\r\n", MAX_LSP_MESSAGE_SIZE + 1);
        writer.write_all(header.as_bytes()).await.unwrap();

        let error = read_lsp_message(&mut reader).await.unwrap_err();
        assert!(error.to_string().contains("message exceeds"));
    }

    #[tokio::test]
    async fn drains_stderr_without_pipe_backpressure() {
        let (mut writer, reader) = duplex(64);
        let drain = tokio::spawn(drain_language_server_stderr(reader, 42));

        timeout(
            Duration::from_secs(1),
            writer.write_all(&vec![b'x'; 1024 * 1024]),
        )
        .await
        .expect("stderr writer was blocked")
        .unwrap();
        drop(writer);

        timeout(Duration::from_secs(1), drain)
            .await
            .expect("stderr drain did not finish")
            .unwrap();
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn launched_server_drains_stderr_before_reading_stdout() {
        let mut command = Command::new("node.exe");
        command.args([
            "-e",
            r#"const fs = require("fs"); fs.writeSync(2, Buffer.alloc(1024 * 1024, 120)); fs.writeSync(1, "Content-Length: 2\r\n\r\n{}");"#,
        ]);

        let process = LangServerProcess::launch(command, IOMethod::StdIO).unwrap();
        let reader = process.create_reader();
        let message = timeout(Duration::from_secs(5), reader.receive_message())
            .await
            .expect("language server remained blocked on stderr")
            .unwrap();

        assert_eq!(message, "{}");
        timeout(
            Duration::from_secs(5),
            reader.wait_for_exit(Duration::from_secs(1)),
        )
        .await
        .expect("language server did not exit")
        .unwrap();
    }
}
