/// Language Server Protocol (LSP) process manager
/// This module provides functionality to launch and communicate with language servers
/// using the Language Server Protocol over stdio.
use std::{
    process::{Command, Stdio},
    sync::Arc,
};

use anyhow::Result;
use log::trace;
use serde::{Deserialize, Serialize};
use specta::Type;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    process::Child,
    sync::{Mutex, RwLock},
};

use crate::runner::command_flag_hide_new_console;

/// Represents a running language server process with stdio communication
/// This struct is designed to be shared across multiple threads safely
pub struct LangServerProcess {
    proc: Arc<Mutex<Child>>,
    writer: Arc<Mutex<Box<dyn AsyncWrite + Unpin + Send>>>,
    reader: Arc<Mutex<Box<dyn AsyncRead + Unpin + Send>>>,
}

/// A handle for writing to the language server from a separate thread
pub struct LangServerWriter {
    proc: Arc<Mutex<Child>>,
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
                let stdout = child.stdout.take().unwrap();
                let stdin = child.stdin.take().unwrap();
                (Box::new(stdout), Box::new(stdin))
            }
        };

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
            proc: Arc::clone(&self.proc),
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
        let header = format!("Content-Length: {}\r\n\r\n", data.len());
        writer.write_all(header.as_bytes()).await?;
        writer.write_all(data).await?;
        writer.flush().await?;
        Ok(())
    }

    /// Read a complete LSP message from the language server
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - The message bytes or an error
    pub async fn read(&self) -> Result<Vec<u8>> {
        let mut reader = self.reader.lock().await;

        // Read the header first
        let mut header = String::new();
        let mut char_buf = [0u8; 1];

        // Read until we get the double CRLF
        while !header.ends_with("\r\n\r\n") {
            reader.read_exact(&mut char_buf).await?;
            header.push(char_buf[0] as char);
        }

        // Parse content length from header
        let content_length = header
            .lines()
            .find(|line| line.starts_with("Content-Length:"))
            .and_then(|line| line.split(':').nth(1))
            .and_then(|s| s.trim().parse::<usize>().ok())
            .ok_or_else(|| anyhow::anyhow!("Invalid Content-Length header"))?;

        // Read the message body
        let mut buffer = vec![0u8; content_length];
        reader.read_exact(&mut buffer).await?;

        Ok(buffer)
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
        let mut proc = self.proc.lock().await;
        proc.kill().await?;
        Ok(())
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
        let header = format!("Content-Length: {}\r\n\r\n", data.len());
        writer.write_all(header.as_bytes()).await?;
        writer.write_all(data).await?;
        writer.flush().await?;
        Ok(())
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
        let mut proc = self.proc.lock().await;
        proc.kill().await?;
        Ok(())
    }
}

impl LangServerReader {
    /// Read a complete LSP message from the language server
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - The message bytes or an error
    pub async fn read(&self) -> Result<Vec<u8>> {
        let mut reader = self.reader.lock().await;

        // Read the header first
        let mut header = String::new();
        let mut char_buf = [0u8; 1];

        // Read until we get the double CRLF
        while !header.ends_with("\r\n\r\n") {
            reader.read_exact(&mut char_buf).await?;
            header.push(char_buf[0] as char);
        }

        // Parse content length from header
        let content_length = header
            .lines()
            .find(|line| line.starts_with("Content-Length:"))
            .and_then(|line| line.split(':').nth(1))
            .and_then(|s| s.trim().parse::<usize>().ok())
            .ok_or_else(|| anyhow::anyhow!("Invalid Content-Length header"))?;

        // Read the message body
        let mut buffer = vec![0u8; content_length];
        reader.read_exact(&mut buffer).await?;

        Ok(buffer)
    }

    /// Receive a JSON message from the language server
    ///
    /// # Returns
    /// * `Result<String>` - The received JSON message or an error
    pub async fn receive_message(&self) -> Result<String> {
        let data = self.read().await?;
        Ok(String::from_utf8(data)?)
    }

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
}
