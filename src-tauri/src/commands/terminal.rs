use std::{
    collections::HashMap,
    io::{Read, Write},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use crate::runner::cmd::parse_command_with_env;

use super::runner::get_default_env;

const PTY_CHILD_PROXY_ARG: &str = "--algorimejo-pty-child-proxy";
const STDERR_FRAME_PREFIX: &[u8] = b"\x1b]6973;algorimejo-stderr;";
const STDERR_FRAME_SUFFIX: u8 = 0x07;
// Keep an encoded frame below common PTY atomic-write limits to avoid stdout interleaving.
const STDERR_CHUNK_SIZE: usize = 1024;
const MAX_STDERR_FRAME_PAYLOAD: usize = STDERR_CHUNK_SIZE * 2;

struct PtySession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

#[derive(Clone, Default)]
pub struct PtySessionState {
    sessions: Arc<Mutex<HashMap<String, Arc<PtySession>>>>,
}

impl PtySessionState {
    pub fn kill_all(&self) {
        let sessions = match self.sessions.lock() {
            Ok(sessions) => sessions.values().cloned().collect::<Vec<_>>(),
            Err(error) => {
                log::warn!("failed to lock PTY sessions during shutdown: {error}");
                return;
            }
        };

        for session in sessions {
            if let Ok(mut killer) = session.killer.lock() {
                if let Err(error) = killer.kill() {
                    log::warn!("failed to terminate PTY session during shutdown: {error}");
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum PtyProcessEventKind {
    Output {
        data: Vec<u8>,
    },
    Stderr {
        data: Vec<u8>,
    },
    Exit {
        exit_code: u32,
        signal: Option<String>,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, PartialEq)]
enum PtyOutputChunk {
    Output(Vec<u8>),
    Stderr(Vec<u8>),
}

#[derive(Default)]
struct PtyOutputParser {
    pending: Vec<u8>,
}

impl PtyOutputParser {
    fn push(&mut self, data: &[u8]) -> Vec<PtyOutputChunk> {
        self.pending.extend_from_slice(data);
        let mut chunks = Vec::new();

        loop {
            let Some(prefix_pos) = find_bytes(&self.pending, STDERR_FRAME_PREFIX) else {
                let retained = suffix_prefix_overlap(&self.pending, STDERR_FRAME_PREFIX);
                let output_len = self.pending.len().saturating_sub(retained);
                if output_len > 0 {
                    chunks.push(PtyOutputChunk::Output(
                        self.pending.drain(..output_len).collect(),
                    ));
                }
                break;
            };

            if prefix_pos > 0 {
                chunks.push(PtyOutputChunk::Output(
                    self.pending.drain(..prefix_pos).collect(),
                ));
                continue;
            }

            let payload_start = STDERR_FRAME_PREFIX.len();
            let Some(suffix_offset) = self.pending[payload_start..]
                .iter()
                .position(|byte| *byte == STDERR_FRAME_SUFFIX)
            else {
                if self.pending.len() > payload_start + MAX_STDERR_FRAME_PAYLOAD {
                    chunks.push(PtyOutputChunk::Output(vec![self.pending.remove(0)]));
                    continue;
                }
                break;
            };
            let payload_end = payload_start + suffix_offset;

            match decode_hex(&self.pending[payload_start..payload_end]) {
                Some(stderr) => {
                    chunks.push(PtyOutputChunk::Stderr(stderr));
                    self.pending.drain(..=payload_end);
                }
                None => chunks.push(PtyOutputChunk::Output(vec![self.pending.remove(0)])),
            }
        }

        chunks
    }

    fn finish(mut self) -> Vec<PtyOutputChunk> {
        if self.pending.is_empty() {
            Vec::new()
        } else {
            vec![PtyOutputChunk::Output(std::mem::take(&mut self.pending))]
        }
    }
}

fn suffix_prefix_overlap(data: &[u8], prefix: &[u8]) -> usize {
    let max_overlap = data.len().min(prefix.len().saturating_sub(1));
    (1..=max_overlap)
        .rev()
        .find(|overlap| data[data.len() - overlap..] == prefix[..*overlap])
        .unwrap_or(0)
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn decode_hex(data: &[u8]) -> Option<Vec<u8>> {
    if data.len() % 2 != 0 {
        return None;
    }

    data.chunks_exact(2)
        .map(|pair| {
            let high = (pair[0] as char).to_digit(16)?;
            let low = (pair[1] as char).to_digit(16)?;
            Some(((high << 4) | low) as u8)
        })
        .collect()
}

fn write_stderr_frame(output: &mut impl Write, data: &[u8]) -> std::io::Result<()> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut frame = Vec::with_capacity(STDERR_FRAME_PREFIX.len() + data.len() * 2 + 1);
    frame.extend_from_slice(STDERR_FRAME_PREFIX);
    for byte in data {
        frame.push(HEX[(byte >> 4) as usize]);
        frame.push(HEX[(byte & 0x0f) as usize]);
    }
    frame.push(STDERR_FRAME_SUFFIX);
    output.write_all(&frame)?;
    output.flush()
}

/// Runs the target command inside the PTY while keeping stderr distinguishable.
/// Returns `None` for a normal application launch and an exit code in proxy mode.
pub fn run_pty_child_proxy() -> Option<i32> {
    let mut args = std::env::args_os();
    let _executable = args.next();
    if args.next().as_deref() != Some(PTY_CHILD_PROXY_ARG.as_ref()) {
        return None;
    }

    let Some(program) = args.next() else {
        let _ = write_stderr_frame(&mut std::io::stdout(), b"missing PTY child program\n");
        return Some(2);
    };

    let result = Command::new(program)
        .args(args)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match result {
        Ok(child) => child,
        Err(error) => {
            let _ = write_stderr_frame(&mut std::io::stdout(), error.to_string().as_bytes());
            return Some(1);
        }
    };

    if let Some(mut stderr) = child.stderr.take() {
        let mut output = std::io::stdout();
        let mut buffer = [0_u8; STDERR_CHUNK_SIZE];
        loop {
            match stderr.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    if write_stderr_frame(&mut output, &buffer[..size]).is_err() {
                        let _ = child.kill();
                        return Some(1);
                    }
                }
                Err(_) => break,
            }
        }
    }

    Some(
        child
            .wait()
            .map(|status| status.code().unwrap_or(1))
            .unwrap_or(1),
    )
}

fn emit_output_chunk(app: &tauri::AppHandle, session_id: &str, chunk: PtyOutputChunk) {
    let event = match chunk {
        PtyOutputChunk::Output(data) => PtyProcessEventKind::Output { data },
        PtyOutputChunk::Stderr(data) => PtyProcessEventKind::Stderr { data },
    };
    emit_event(app, session_id.to_string(), event);
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct PtyProcessEvent {
    pub session_id: String,
    pub event: PtyProcessEventKind,
}

fn emit_event(app: &tauri::AppHandle, session_id: String, event: PtyProcessEventKind) {
    if let Err(error) = (PtyProcessEvent { session_id, event }).emit(app) {
        log::warn!("failed to emit PTY event: {error}");
    }
}

#[tauri::command]
#[specta::specta]
pub async fn launch_pty_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtySessionState>,
    session_id: String,
    task_tag: String,
    command: String,
    env: HashMap<String, String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    {
        let sessions = state.sessions.lock().map_err(|error| error.to_string())?;
        if sessions.contains_key(&session_id) {
            return Err(format!("PTY session {session_id} already exists"));
        }
    }

    let default_env = get_default_env(&app).map_err(|error| error.to_string())?;
    let mut env: HashMap<String, String> = env.into_iter().chain(default_env).collect();
    let current_dir = crate::runner::temp_dir(&task_tag);
    env.insert("CWD".to_string(), current_dir.display().to_string());

    let command = parse_command_with_env(&command, &env)?;
    let proxy_executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let mut pty_command = CommandBuilder::new(proxy_executable);
    pty_command.arg(PTY_CHILD_PROXY_ARG);
    pty_command.arg(command.get_program());
    pty_command.args(command.get_args());
    pty_command.cwd(&current_dir);
    for (key, value) in &env {
        pty_command.env(key, value);
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let mut child = pair
        .slave
        .spawn_command(pty_command)
        .map_err(|error| error.to_string())?;
    let killer = child.clone_killer();
    let reader = match pair.master.try_clone_reader() {
        Ok(reader) => reader,
        Err(error) => {
            let _ = child.kill();
            return Err(error.to_string());
        }
    };
    let writer = match pair.master.take_writer() {
        Ok(writer) => writer,
        Err(error) => {
            let _ = child.kill();
            return Err(error.to_string());
        }
    };
    drop(pair.slave);

    let session = Arc::new(PtySession {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(killer),
    });
    state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .insert(session_id.clone(), session);

    let output_app = app.clone();
    let output_session_id = session_id.clone();
    let reader_thread = thread::spawn(move || {
        let mut reader = reader;
        let mut buffer = [0_u8; 8192];
        let mut parser = PtyOutputParser::default();
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    for chunk in parser.push(&buffer[..size]) {
                        emit_output_chunk(&output_app, &output_session_id, chunk);
                    }
                }
                Err(error) => {
                    log::trace!("PTY output reader closed: {error}");
                    break;
                }
            }
        }
        for chunk in parser.finish() {
            emit_output_chunk(&output_app, &output_session_id, chunk);
        }
    });

    let sessions = state.sessions.clone();
    thread::spawn(move || {
        let status = child.wait();
        if reader_thread.join().is_err() {
            log::warn!("PTY output reader thread panicked");
        }
        if let Ok(mut sessions) = sessions.lock() {
            sessions.remove(&session_id);
        }

        match status {
            Ok(status) => emit_event(
                &app,
                session_id,
                PtyProcessEventKind::Exit {
                    exit_code: status.exit_code(),
                    signal: status.signal().map(str::to_string),
                },
            ),
            Err(error) => emit_event(
                &app,
                session_id,
                PtyProcessEventKind::Error {
                    message: error.to_string(),
                },
            ),
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stderr_frame(data: &[u8]) -> Vec<u8> {
        let mut frame = Vec::new();
        write_stderr_frame(&mut frame, data).unwrap();
        frame
    }

    #[test]
    fn parses_stderr_between_stdout_chunks() {
        let mut parser = PtyOutputParser::default();
        let mut input = b"before".to_vec();
        input.extend(stderr_frame(b"failure"));
        input.extend(b"after");

        let mut chunks = parser.push(&input);
        chunks.extend(parser.finish());

        assert_eq!(
            chunks,
            vec![
                PtyOutputChunk::Output(b"before".to_vec()),
                PtyOutputChunk::Stderr(b"failure".to_vec()),
                PtyOutputChunk::Output(b"after".to_vec()),
            ]
        );
    }

    #[test]
    fn parses_frames_split_across_reads() {
        let frame = stderr_frame(b"split output");
        let split_at = STDERR_FRAME_PREFIX.len() + 3;
        let mut parser = PtyOutputParser::default();

        let mut chunks = parser.push(&frame[..split_at]);
        assert!(chunks.is_empty());
        chunks.extend(parser.push(&frame[split_at..]));

        assert_eq!(
            chunks,
            vec![PtyOutputChunk::Stderr(b"split output".to_vec())]
        );
    }

    #[test]
    fn emits_short_stdout_without_waiting_for_another_read() {
        let mut parser = PtyOutputParser::default();

        assert_eq!(
            parser.push(b"prompt: "),
            vec![PtyOutputChunk::Output(b"prompt: ".to_vec())]
        );
    }
}

#[tauri::command]
#[specta::specta]
pub async fn write_pty_session(
    state: tauri::State<'_, PtySessionState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("PTY session {session_id} not found"))?;
    let mut writer = session.writer.lock().map_err(|error| error.to_string())?;
    writer
        .write_all(data.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn resize_pty_session(
    state: tauri::State<'_, PtySessionState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("PTY session {session_id} not found"))?;
    let result = session
        .master
        .lock()
        .map_err(|error| error.to_string())?
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string());
    result
}

#[tauri::command]
#[specta::specta]
pub async fn kill_pty_session(
    state: tauri::State<'_, PtySessionState>,
    session_id: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("PTY session {session_id} not found"))?;
    let result = session
        .killer
        .lock()
        .map_err(|error| error.to_string())?
        .kill()
        .map_err(|error| error.to_string());
    result
}
