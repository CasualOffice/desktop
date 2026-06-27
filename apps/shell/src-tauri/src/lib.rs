use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

static WINDOW_SEQ: AtomicU32 = AtomicU32::new(0);
const MAX_RECENTS: usize = 20;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum DocKind {
    Docx,
    Sheets,
}

impl DocKind {
    fn subpath(&self) -> &'static str {
        match self {
            DocKind::Docx => "docx/index.html",
            DocKind::Sheets => "sheets/index.html",
        }
    }
    fn title_prefix(&self) -> &'static str {
        match self {
            DocKind::Docx => "Document",
            DocKind::Sheets => "Spreadsheet",
        }
    }
    fn from_path(path: &str) -> Option<Self> {
        let lower = path.to_lowercase();
        if lower.ends_with(".docx")
            || lower.ends_with(".txt")
            || lower.ends_with(".md")
            || lower.ends_with(".markdown")
        {
            Some(DocKind::Docx)
        } else if lower.ends_with(".xlsx")
            || lower.ends_with(".xlsm")
            || lower.ends_with(".ods")
            || lower.ends_with(".csv")
            || lower.ends_with(".tsv")
            || lower.ends_with(".tab")
        {
            Some(DocKind::Sheets)
        } else {
            None
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct RecentFile {
    path: String,
    kind: DocKind,
    last_opened: u64,
    /// True if the user pinned this file — pinned entries sort first
    /// in the launcher's recent list and aren't evicted when the list
    /// exceeds MAX_RECENTS. Defaults to false for backward compat with
    /// older recent.json files.
    #[serde(default)]
    pinned: bool,
}

#[derive(Default)]
struct RecentsState {
    list: Mutex<Vec<RecentFile>>,
}

/// Tracks in-progress chunked saves. Maps the *real* destination path the
/// editor asked to save to → the sibling temp file we're actually writing
/// into. The save contract is:
///   begin_save_document(path) → write_save_chunk(path, …)* → commit_save_document(path)
/// begin truncates/creates the temp file; write_save_chunk appends into it;
/// commit fsyncs and atomically renames temp → path. Writing into a temp
/// sibling and renaming only on commit means a failed/aborted save never
/// corrupts or truncates the user's existing file.
#[derive(Default)]
struct SaveState {
    /// real path → temp path currently being written.
    in_progress: Mutex<HashMap<String, PathBuf>>,
}

/// Per-window unsaved-changes flag. Keyed by the Tauri window label
/// (e.g. "doc-3"). The editor reports edits/saves via `set_window_dirty`;
/// the window-close guard reads it to decide whether to confirm before
/// closing. Absent/false means clean → close freely.
#[derive(Default)]
struct DirtyState {
    flags: Mutex<HashMap<String, bool>>,
}

/// Per-window filesystem watchers for external-change detection. Keyed by the
/// Tauri window label (e.g. "doc-3"). Each open document with a real on-disk
/// path gets a `notify` watcher on that file; when the OS reports the file was
/// renamed/moved/deleted or modified outside the editor, we emit a
/// `deskapp://file-changed` event to that window so the editor can warn the
/// user that its in-memory path is now stale. The watcher handle is held here
/// so it lives as long as the window does and is dropped (stopping the watch)
/// when the window closes. A watch that fails to start is simply absent from
/// this map — opening the document still proceeds.
#[derive(Default)]
struct WatchState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

/// Classify a `notify` event into the coarse kind the editor cares about.
/// We only emit on the three cases that invalidate the editor's bound path:
///   - "removed"  → the file was deleted (or renamed away from this path)
///   - "renamed"  → an explicit rename/move was reported
///   - "modified" → contents changed on disk outside the editor
///
/// Access/metadata/other noise is ignored (returns None) so we don't spam the
/// editor with events it can't act on.
fn classify_fs_event(kind: &EventKind) -> Option<&'static str> {
    use notify::event::{ModifyKind, RenameMode};
    match kind {
        EventKind::Remove(_) => Some("removed"),
        // A rename can surface either as Modify(Name(..)) (most backends) or,
        // on some platforms, as a Remove of the old path. Treat the explicit
        // name-change variants as "renamed"; the "To" side of a two-event
        // rename also lands here.
        EventKind::Modify(ModifyKind::Name(RenameMode::From))
        | EventKind::Modify(ModifyKind::Name(RenameMode::To))
        | EventKind::Modify(ModifyKind::Name(RenameMode::Both))
        | EventKind::Modify(ModifyKind::Name(RenameMode::Any)) => Some("renamed"),
        EventKind::Modify(ModifyKind::Data(_)) | EventKind::Modify(ModifyKind::Any) => {
            Some("modified")
        }
        _ => None,
    }
}

/// Start watching the on-disk `path` backing the document in window `label`.
/// On any external change (remove/rename/modify), emit a `deskapp://file-changed`
/// event to that window carrying `{ kind, path }`, and — on removal — drop the
/// path from the recents list (it no longer exists, so it shouldn't reappear in
/// the launcher's recent files). The watcher handle is stored in `WatchState`
/// keyed by `label` so it's torn down when the window closes.
///
/// Failures (e.g. the platform backend can't watch this path) are logged to
/// stderr and otherwise ignored — a watch problem must never block or crash the
/// open of a document.
///
/// EVENT CONTRACT (documented for the editor repos to wire UI against):
///   event name: `deskapp://file-changed`
///   payload:    `{ "kind": "removed" | "renamed" | "modified", "path": "<abs path>" }`
///   delivery:   emitted only to the document window whose file changed.
fn start_file_watch(app: &AppHandle, label: &str, path: &str) {
    let watch_path = std::path::Path::new(path).to_path_buf();
    // Watch the parent directory (non-recursively) rather than the file
    // itself: on most platforms a watch on the file's inode stops firing once
    // the file is renamed/deleted, which is exactly the case we most need to
    // detect. Watching the directory and filtering by filename catches the
    // rename/delete reliably. If the file has no parent (root), fall back to
    // watching the path directly.
    let (watch_target, recursive) = match watch_path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => {
            (parent.to_path_buf(), RecursiveMode::NonRecursive)
        }
        _ => (watch_path.clone(), RecursiveMode::NonRecursive),
    };

    let app_for_cb = app.clone();
    let label_for_cb = label.to_string();
    let path_for_cb = path.to_string();
    let watched_file = watch_path.clone();

    let mut watcher = match notify::recommended_watcher(
        move |res: notify::Result<notify::Event>| {
            let event = match res {
                Ok(ev) => ev,
                Err(e) => {
                    eprintln!("file-watch: error event for {path_for_cb}: {e}");
                    return;
                }
            };
            let Some(kind) = classify_fs_event(&event.kind) else {
                return;
            };
            // Directory watch reports every file in the dir — only react when
            // the event touches the specific file this window has open.
            let touches_file = event.paths.iter().any(|p| p == &watched_file);
            if !touches_file {
                return;
            }
            // On removal, also drop the now-dead path from recents so the
            // launcher doesn't keep offering a file that's gone.
            if kind == "removed" {
                if let Some(state) = app_for_cb.try_state::<RecentsState>() {
                    let mut list = state.list.lock().unwrap();
                    let before = list.len();
                    list.retain(|r| r.path != path_for_cb);
                    if list.len() != before {
                        let snapshot = list.clone();
                        drop(list);
                        let _ = save_recents(&app_for_cb, &snapshot);
                    }
                }
            }
            if let Some(window) = app_for_cb.get_webview_window(&label_for_cb) {
                let _ = window.emit(
                    "deskapp://file-changed",
                    serde_json::json!({ "kind": kind, "path": path_for_cb }),
                );
            }
        },
    ) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("file-watch: could not create watcher for {path}: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&watch_target, recursive) {
        eprintln!(
            "file-watch: could not watch {}: {e}",
            watch_target.display()
        );
        return;
    }

    if let Some(state) = app.try_state::<WatchState>() {
        state
            .watchers
            .lock()
            .unwrap()
            .insert(label.to_string(), watcher);
    }
}

/// Stop and drop the filesystem watcher for window `label`, if any. Called when
/// a document window is destroyed so we don't leak watchers (or keep firing
/// events at a window that no longer exists).
fn stop_file_watch(app: &AppHandle, label: &str) {
    if let Some(state) = app.try_state::<WatchState>() {
        state.watchers.lock().unwrap().remove(label);
    }
}

/// Deterministic temp path for a chunked save: a sibling of the real file
/// so the final rename stays on the same filesystem (rename across mounts
/// is not atomic and can fail with EXDEV).
fn save_temp_path(path: &str) -> PathBuf {
    let mut s = path.to_string();
    s.push_str(".casualoffice.tmp");
    PathBuf::from(s)
}

fn recents_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir config dir: {e}"))?;
    Ok(dir.join("recent.json"))
}

fn load_recents(app: &AppHandle) -> Vec<RecentFile> {
    let path = match recents_path(app) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let Ok(bytes) = std::fs::read(&path) else {
        return Vec::new();
    };
    match serde_json::from_slice::<Vec<RecentFile>>(&bytes) {
        Ok(list) => list,
        Err(e) => {
            // A corrupt recents file used to silently default to empty,
            // making the data loss invisible. Surface it on stderr so it's
            // diagnosable from the app logs.
            eprintln!(
                "recents: failed to parse {}: {e}; starting with an empty list",
                path.display()
            );
            Vec::new()
        }
    }
}

fn save_recents(app: &AppHandle, list: &[RecentFile]) -> Result<(), String> {
    let path = recents_path(app)?;
    let bytes = serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Crash-recovery sidecars ------------------------------------------------
// The editor writes the latest unsaved bytes to a hidden sidecar next to the
// bound file (`.<name>.recovery`) on a debounced schedule and registers it, so
// the launcher can detect orphaned sidecars on relaunch (a crash left them
// behind). A clean Save clears both the sidecar and the registry entry.

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct RecoveryEntry {
    /// The document's real on-disk path.
    path: String,
    /// The sidecar holding the latest unsaved bytes.
    recovery_path: String,
    /// Unix seconds of the last recovery write.
    saved_at: u64,
}

fn recovery_sidecar_for(path: &str) -> PathBuf {
    let p = PathBuf::from(path);
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "document".to_string());
    let dir = p
        .parent()
        .map(|d| d.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    dir.join(format!(".{name}.recovery"))
}

fn recovery_registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir config dir: {e}"))?;
    Ok(dir.join("recovery.json"))
}

fn load_recovery_registry(app: &AppHandle) -> Vec<RecoveryEntry> {
    let Ok(path) = recovery_registry_path(app) else {
        return Vec::new();
    };
    let Ok(bytes) = std::fs::read(&path) else {
        return Vec::new();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn save_recovery_registry(app: &AppHandle, list: &[RecoveryEntry]) -> Result<(), String> {
    let path = recovery_registry_path(app)?;
    let bytes = serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Write the latest unsaved bytes to the document's recovery sidecar (atomic
/// temp + rename) and register it. Called by the editor's debounced autosave.
#[tauri::command]
fn write_recovery(app: AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("refusing to write an empty recovery snapshot".to_string());
    }
    let sidecar = recovery_sidecar_for(&path);
    let tmp = save_temp_path(&sidecar.to_string_lossy());
    std::fs::write(&tmp, &bytes).map_err(|e| format!("write recovery temp: {e}"))?;
    std::fs::rename(&tmp, &sidecar).map_err(|e| format!("commit recovery: {e}"))?;
    let mut reg = load_recovery_registry(&app);
    reg.retain(|e| e.path != path);
    reg.push(RecoveryEntry {
        path,
        recovery_path: sidecar.to_string_lossy().to_string(),
        saved_at: now_secs(),
    });
    save_recovery_registry(&app, &reg)
}

/// Read the recovery bytes for `path`, if a sidecar exists.
#[tauri::command]
fn read_recovery(path: String) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(recovery_sidecar_for(&path)) {
        Ok(b) => Ok(Some(b)),
        Err(_) => Ok(None),
    }
}

/// Delete the recovery sidecar + registry entry for `path` — on a clean Save or
/// when the user discards a recovery.
#[tauri::command]
fn clear_recovery(app: AppHandle, path: String) -> Result<(), String> {
    let _ = std::fs::remove_file(recovery_sidecar_for(&path));
    let mut reg = load_recovery_registry(&app);
    reg.retain(|e| e.path != path);
    save_recovery_registry(&app, &reg)
}

/// Registered recoveries whose sidecar AND original file still exist (orphaned
/// by a crash). Prunes stale/cleared entries from the registry on the way.
#[tauri::command]
fn pending_recoveries(app: AppHandle) -> Vec<RecoveryEntry> {
    let mut alive = Vec::new();
    let mut keep = Vec::new();
    for e in load_recovery_registry(&app) {
        if std::path::Path::new(&e.recovery_path).exists()
            && std::path::Path::new(&e.path).exists()
        {
            alive.push(e.clone());
            keep.push(e);
        } else {
            let _ = std::fs::remove_file(&e.recovery_path);
        }
    }
    let _ = save_recovery_registry(&app, &keep);
    alive
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
fn get_recent_files(state: tauri::State<'_, RecentsState>) -> Vec<RecentFile> {
    state.list.lock().unwrap().clone()
}

#[tauri::command]
fn clear_recent_files(
    app: AppHandle,
    state: tauri::State<'_, RecentsState>,
) -> Result<(), String> {
    state.list.lock().unwrap().clear();
    save_recents(&app, &[])
}

#[tauri::command]
fn add_recent_file(
    app: AppHandle,
    state: tauri::State<'_, RecentsState>,
    path: String,
) -> Result<(), String> {
    touch_recent(&app, &state, &path);
    Ok(())
}

/// Remove a single entry from the recents list — used by the launcher
/// when it discovers a stale path (file moved/deleted on disk).
#[tauri::command]
fn remove_recent_file(
    app: AppHandle,
    state: tauri::State<'_, RecentsState>,
    path: String,
) -> Result<(), String> {
    let mut list = state.list.lock().unwrap();
    list.retain(|r| r.path != path);
    let snapshot = list.clone();
    drop(list);
    save_recents(&app, &snapshot)
}

fn touch_recent(app: &AppHandle, state: &RecentsState, path: &str) {
    let Some(kind) = DocKind::from_path(path) else {
        return;
    };
    let mut list = state.list.lock().unwrap();
    // Preserve a pre-existing pinned flag if the entry is already in the
    // list (we don't want re-opening a pinned file to silently unpin it).
    let was_pinned = list.iter().find(|r| r.path == path).map(|r| r.pinned).unwrap_or(false);
    list.retain(|r| r.path != path);
    list.insert(
        0,
        RecentFile {
            path: path.to_string(),
            kind,
            last_opened: now_secs(),
            pinned: was_pinned,
        },
    );
    // Truncate to MAX_RECENTS, but never evict pinned entries.
    if list.len() > MAX_RECENTS {
        let mut kept: Vec<RecentFile> = Vec::with_capacity(MAX_RECENTS);
        // Pinned first (preserve order), then most-recent unpinned to fill.
        // Cap the pinned loop too: if the user has pinned more than
        // MAX_RECENTS files, we still must not blow past the cap.
        for r in list.iter().filter(|r| r.pinned) {
            if kept.len() >= MAX_RECENTS {
                break;
            }
            kept.push(r.clone());
        }
        for r in list.iter().filter(|r| !r.pinned) {
            if kept.len() >= MAX_RECENTS {
                break;
            }
            kept.push(r.clone());
        }
        *list = kept;
    }
    let snapshot = list.clone();
    drop(list);
    let _ = save_recents(app, &snapshot);
}

#[tauri::command]
fn set_recent_pinned(
    app: AppHandle,
    state: tauri::State<'_, RecentsState>,
    path: String,
    pinned: bool,
) -> Result<(), String> {
    let mut list = state.list.lock().unwrap();
    for r in list.iter_mut() {
        if r.path == path {
            r.pinned = pinned;
        }
    }
    // Bubble pinned entries to the top while keeping intra-group order
    // (sort_by_key is stable in Rust). Pinned == true sorts before false.
    list.sort_by_key(|r| !r.pinned);
    let snapshot = list.clone();
    drop(list);
    save_recents(&app, &snapshot)
}

/// Open a per-document Tauri window. Each opened file becomes a top-level
/// webview window so the editor gets its own process and event loop. If a
/// window is already showing the same file (sticky behavior), focus that
/// one instead of opening a duplicate — matches the convention of Excel
/// and Word when you double-click a file that's already open.
#[tauri::command]
async fn open_document_window(
    app: AppHandle,
    state: tauri::State<'_, RecentsState>,
    kind: DocKind,
    file_path: Option<String>,
) -> Result<String, String> {
    // Sticky-window: if this exact file is already open in another doc
    // window, focus that one instead of creating a duplicate.
    if let Some(p) = file_path.as_deref() {
        for window in app.webview_windows().values() {
            let label = window.label();
            if !label.starts_with("doc-") {
                continue;
            }
            if let Ok(url) = window.url() {
                if let Some(q) = url.query() {
                    let mut wants = "file=".to_string();
                    wants.push_str(&urlencoding_lite(p));
                    if q.contains(&wants) {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                        // Merely re-focusing an already-open window must NOT
                        // re-timestamp the recents entry — the document
                        // wasn't actually (re)opened.
                        return Ok(label.to_string());
                    }
                }
            }
        }
    }

    let id = WINDOW_SEQ.fetch_add(1, Ordering::SeqCst);
    let label = format!("doc-{id}");

    let title = match &file_path {
        Some(p) => format!(
            "{} — {}",
            kind.title_prefix(),
            std::path::Path::new(p)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(p)
        ),
        None => format!("{} — Untitled", kind.title_prefix()),
    };

    // Always include `desk=1` so the editor's bootstrap wires the
    // native-save bridge. The popped-out window is top-level, so the
    // bootstrap will route through the Tauri global `invoke` (requires
    // `withGlobalTauri: true` in tauri.conf.json).
    let mut url = format!("{}?desk=1", kind.subpath());
    if let Some(p) = file_path.as_ref() {
        url.push_str("&file=");
        url.push_str(&urlencoding_lite(p));
    }
    // Carry the launcher's theme preference so the editor window opens in
    // the right mode immediately, rather than flashing the default and
    // waiting for the first `deskapp://theme` broadcast.
    let theme = get_settings(app.clone()).theme;
    url.push_str("&theme=");
    url.push_str(&urlencoding_lite(&theme));

    // The editor's own `desk-bridge-bootstrap.ts` runs as the first import
    // inside the new window; it defines window.__deskApp__ using either
    // postMessage (iframe — no longer used) or window.__TAURI__.core
    // (top-level window — the case here). No host-side injection needed.
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(1280.0, 860.0)
        .min_inner_size(720.0, 480.0)
        .resizable(true)
        .maximized(true)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    if get_settings(app.clone()).privacy_mode {
        let _ = window.set_content_protected(true);
    }

    attach_unsaved_guard(&app, &window);

    if let Some(p) = file_path.as_deref() {
        touch_recent(&app, &state, p);
        // Detect external rename/move/delete/modify of the open file. Best
        // effort — a watch failure is logged and ignored, never fatal.
        start_file_watch(&app, &label, p);
    }

    Ok(title)
}

/// Attach a CloseRequested handler that prevents accidental data loss: if
/// the editor has reported unsaved changes for this window (via
/// set_window_dirty), intercept the close, ask the user with a native
/// dialog, and only destroy the window if they confirm. A clean window
/// (no dirty report, or dirty == false) always closes normally — we must
/// never make a clean window unclosable. The dirty-map entry is cleaned up
/// when the window is destroyed.
fn attach_unsaved_guard(app: &AppHandle, window: &tauri::WebviewWindow) {
    let handle = app.clone();
    let win = window.clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            // Lock, copy the bool, drop the guard *before* anything that
            // could block (the dialog) to avoid holding the mutex across
            // the prompt and risking a deadlock.
            let dirty = {
                let flags = handle.state::<DirtyState>();
                let guard = flags.flags.lock().unwrap();
                guard.get(&label).copied().unwrap_or(false)
            };
            if !dirty {
                // Clean window — let it close normally; tidy up the entry.
                handle
                    .state::<DirtyState>()
                    .flags
                    .lock()
                    .unwrap()
                    .remove(&label);
                return;
            }
            // Respect the user's "warn before closing with unsaved changes"
            // preference. When it's off, a dirty window closes without the
            // prompt — otherwise the toggle in Settings does nothing.
            if !get_settings(handle.clone()).warn_on_unsaved_close {
                handle
                    .state::<DirtyState>()
                    .flags
                    .lock()
                    .unwrap()
                    .remove(&label);
                return;
            }
            // Dirty: hold the close and ask. blocking_show must not run on
            // the main/UI thread, so confirm on a worker thread and destroy
            // the window from there if the user agrees.
            api.prevent_close();
            let dlg_handle = handle.clone();
            let dlg_win = win.clone();
            let dlg_label = label.clone();
            std::thread::spawn(move || {
                let confirmed = dlg_handle
                    .dialog()
                    .message("You have unsaved changes. Close without saving?")
                    .buttons(MessageDialogButtons::OkCancel)
                    .blocking_show();
                if confirmed {
                    dlg_handle
                        .state::<DirtyState>()
                        .flags
                        .lock()
                        .unwrap()
                        .remove(&dlg_label);
                    let _ = dlg_win.destroy();
                }
            });
        }
        tauri::WindowEvent::Destroyed => {
            handle
                .state::<DirtyState>()
                .flags
                .lock()
                .unwrap()
                .remove(&label);
            // Tear down the file-change watcher for this window so we don't
            // leak watchers or emit events at a window that's gone.
            stop_file_watch(&handle, &label);
        }
        _ => {}
    });
}

/// Total size of a file. Used by the launcher to compute how many
/// chunks to ask for.
#[tauri::command]
fn document_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("stat {path}: {e}"))
}

/// Read a slice of a file. The launcher reads documents in 1 MB chunks
/// so each individual IPC message stays well below any JSON-array
/// truncation threshold — observed behavior was that returning a 10 MB
/// Vec<u8> as JSON corrupted the tail, breaking JSZip's EOCD lookup in
/// the docx editor.
///
/// (Tauri 2 has a `tauri::ipc::Response::new(bytes)` API that's
/// supposed to side-step JSON entirely, but on this Linux/WebKitGTK
/// build we saw it still fail for large files. Chunked read sidesteps
/// the question by keeping each payload tiny.)
#[tauri::command]
async fn read_document_chunk(
    path: String,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(&path).map_err(|e| format!("open {path}: {e}"))?;
    f.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("seek {path}@{offset}: {e}"))?;
    let mut buf = vec![0u8; length as usize];
    let n = f.read(&mut buf).map_err(|e| format!("read {path}: {e}"))?;
    buf.truncate(n);
    Ok(buf)
}

/// One-shot read kept around for small files and as a debugging hook —
/// the launcher's normal path is now read_document_chunk in a loop. For
/// anything past a few MB the JS side will hit the chunked path.
#[tauri::command]
async fn load_document(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))
}

/// Cheap existence check used by the launcher before opening a recent
/// file — saves the user from a confusing "couldn't render" if the file
/// has been moved or deleted since it was last opened.
#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

/// Open the OS file manager pointed at the directory containing the
/// given file. Matches the "Show in Finder" / "Show in File Explorer"
/// affordance in every Office product.
#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    // If the file is missing, open the parent dir we *can* reach. If even
    // that's missing, fall back to the user's home directory rather than
    // failing the user invisibly.
    let target = if p.is_file() {
        p.parent().map(|q| q.to_path_buf())
    } else if p.is_dir() {
        Some(p.to_path_buf())
    } else {
        None
    };
    let target = target.unwrap_or_else(|| {
        std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from("/"))
    });
    let target_str = target.to_string_lossy().to_string();
    #[cfg(target_os = "linux")]
    let cmd = std::process::Command::new("xdg-open").arg(&target_str).spawn();
    #[cfg(target_os = "macos")]
    let cmd = std::process::Command::new("open").arg(&target_str).spawn();
    #[cfg(target_os = "windows")]
    let cmd = std::process::Command::new("explorer").arg(&target_str).spawn();
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    let cmd: Result<std::process::Child, std::io::Error> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "unsupported platform",
    ));
    cmd.map(|_| ()).map_err(|e| format!("open folder: {e}"))
}

#[tauri::command]
async fn save_document(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &bytes).map_err(|e| format!("write {path}: {e}"))
}

// --- Atomic chunked save -----------------------------------------------------
//
// SAVE CONTRACT (editors MUST follow this order):
//   begin_save_document(path)
//   write_save_chunk(path, offset, bytes)*   (any number, in any order)
//   commit_save_document(path)
//
// begin truncates/creates a *temp sibling* `<path>.casualoffice.tmp` — never
// the real file. write_save_chunk writes into that temp file. commit fsyncs
// the temp file and atomically renames it onto the real path. If a chunk
// fails or commit is never reached, the user's existing file is untouched —
// no partial write, no truncation, no corruption.

/// Truncate (or create) the temp sibling for `path`. First step of a chunked
/// save — the editor then calls write_save_chunk in a loop, then
/// commit_save_document. Writing into a temp file and renaming only on commit
/// keeps a failed save from corrupting the user's real file.
/// Core of `begin_save_document`, split out so the atomic-save state machine
/// is unit-testable without a Tauri runtime (the command just unwraps the
/// `State` and delegates).
fn begin_save_impl(state: &SaveState, path: String) -> Result<(), String> {
    let tmp = save_temp_path(&path);
    std::fs::File::create(&tmp)
        .map_err(|e| format!("create {}: {e}", tmp.display()))?;
    state.in_progress.lock().unwrap().insert(path, tmp);
    Ok(())
}

#[tauri::command]
fn begin_save_document(
    state: tauri::State<'_, SaveState>,
    path: String,
) -> Result<(), String> {
    begin_save_impl(state.inner(), path)
}

/// Write a slice of the in-progress save into the temp file for `path`.
/// begin_save_document must run first to create the temp file.
/// Core of `write_save_chunk` (see `begin_save_impl` for the split rationale).
fn write_save_chunk_impl(
    state: &SaveState,
    path: String,
    offset: u64,
    bytes: Vec<u8>,
) -> Result<(), String> {
    use std::io::{Seek, SeekFrom, Write};
    // Derive the temp path deterministically rather than requiring the map
    // entry, so a write can't fail just because state was lost — but prefer
    // the tracked entry when present.
    let tmp = state
        .in_progress
        .lock()
        .unwrap()
        .get(&path)
        .cloned()
        .unwrap_or_else(|| save_temp_path(&path));
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .map_err(|e| format!("open {}: {e}", tmp.display()))?;
    f.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("seek {}@{offset}: {e}", tmp.display()))?;
    f.write_all(&bytes)
        .map_err(|e| format!("write {}: {e}", tmp.display()))?;
    Ok(())
}

#[tauri::command]
fn write_save_chunk(
    state: tauri::State<'_, SaveState>,
    path: String,
    offset: u64,
    bytes: Vec<u8>,
) -> Result<(), String> {
    write_save_chunk_impl(state.inner(), path, offset, bytes)
}

/// Finalize a chunked save: fsync the temp file, then atomically rename it
/// onto the real `path`. Last step of the save contract. After this returns
/// Ok, the real file holds exactly the bytes written across the
/// write_save_chunk calls; before it, the real file is untouched.
/// Core of `commit_save_document` (see `begin_save_impl` for the rationale).
fn commit_save_impl(state: &SaveState, path: String) -> Result<(), String> {
    let tmp = state
        .in_progress
        .lock()
        .unwrap()
        .remove(&path)
        .unwrap_or_else(|| save_temp_path(&path));
    // fsync so the bytes are durably on disk before we expose them under
    // the real name — otherwise a crash right after the rename could leave
    // a renamed-but-empty file.
    {
        let f = std::fs::OpenOptions::new()
            .write(true)
            .open(&tmp)
            .map_err(|e| format!("open {}: {e}", tmp.display()))?;
        f.sync_all()
            .map_err(|e| format!("fsync {}: {e}", tmp.display()))?;
    }
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("commit {} -> {path}: {e}", tmp.display()))?;
    Ok(())
}

#[tauri::command]
fn commit_save_document(
    state: tauri::State<'_, SaveState>,
    path: String,
) -> Result<(), String> {
    commit_save_impl(state.inner(), path)
}

/// Report the unsaved-changes state of a document window. The editor calls
/// this with `dirty = true` on the first edit after a save and `dirty =
/// false` after a successful save. The window-close guard (wired in
/// open_document_window) reads this flag to decide whether to prompt before
/// closing. Keyed by the window's label so each document window is tracked
/// independently.
#[tauri::command]
fn set_window_dirty(
    state: tauri::State<'_, DirtyState>,
    window: tauri::WebviewWindow,
    dirty: bool,
) {
    state
        .flags
        .lock()
        .unwrap()
        .insert(window.label().to_string(), dirty);
}

/// Show a Save As dialog and return the picked path without writing
/// anything. The editor then chunks bytes into write_save_chunk calls.
/// Returns Ok(None) if the user cancels.
#[tauri::command]
async fn pick_save_path(
    app: AppHandle,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_file_name(&suggested_name)
        .save_file(move |p| {
            let _ = tx.send(p.and_then(|fp| fp.into_path().ok()));
        });
    // Bound the wait: if the dialog callback never fires (it has been seen
    // to silently drop on some platforms) blocking forever would hang the
    // save indefinitely. 120s leaves ample time for the user to think.
    let chosen = rx
        .recv_timeout(Duration::from_secs(120))
        .map_err(|_| "save dialog timed out or was dismissed".to_string())?;
    Ok(chosen.map(|p| p.to_string_lossy().to_string()))
}

/// Export the calling window's current page to a real PDF via the platform
/// webview's native print-to-PDF, written to a user-chosen path. Routes like
/// Save As (native dialog) but produces a selectable-text PDF rather than the
/// unreliable browser `window.print()` path. Returns the chosen path, or None
/// if the user cancelled the save dialog.
#[tauri::command]
async fn export_pdf(
    app: AppHandle,
    window: tauri::WebviewWindow,
    suggested_name: String,
) -> Result<Option<String>, String> {
    // Native save dialog (mirrors pick_save_path).
    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_file_name(&suggested_name)
        .save_file(move |p| {
            let _ = tx.send(p.and_then(|fp| fp.into_path().ok()));
        });
    let chosen = rx
        .recv_timeout(Duration::from_secs(120))
        .map_err(|_| "save dialog timed out or was dismissed".to_string())?;
    let path = match chosen {
        Some(p) => p.to_string_lossy().to_string(),
        None => return Ok(None),
    };
    write_window_pdf(&window, &path)?;
    Ok(Some(path))
}

/// Render `window`'s webview to a PDF file at `path` using the platform's
/// native webview print-to-PDF. macOS uses WKWebView.createPDF (selectable
/// text); other platforms are stubbed until their builds exist.
fn write_window_pdf(window: &tauri::WebviewWindow, path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use block2::RcBlock;
        use objc2_foundation::{NSData, NSError};
        use objc2_web_kit::WKWebView;

        let out_path = path.to_string();
        // WKWebView.createPDF is async (completion handler), so collect the
        // result over a channel and wait on it from this command's thread.
        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();
        window
            .with_webview(move |webview| {
                // On macOS `inner()` is a pointer to the wry WKWebView subclass.
                let wk: &WKWebView = unsafe { &*(webview.inner() as *const WKWebView) };
                let handler = RcBlock::new(move |data: *mut NSData, err: *mut NSError| {
                    if !err.is_null() {
                        let msg = unsafe { (*err).localizedDescription() };
                        let _ = tx.send(Err(format!("createPDF failed: {msg}")));
                        return;
                    }
                    if data.is_null() {
                        let _ = tx.send(Err("createPDF returned no data".to_string()));
                        return;
                    }
                    let bytes = unsafe { (*data).to_vec() };
                    let _ = tx.send(Ok(bytes));
                });
                // nil configuration → the full currently-displayed web page.
                unsafe { wk.createPDFWithConfiguration_completionHandler(None, &handler) };
            })
            .map_err(|e| format!("could not access webview: {e}"))?;
        let bytes = rx
            .recv_timeout(Duration::from_secs(60))
            .map_err(|_| "PDF export timed out".to_string())??;
        if bytes.is_empty() {
            return Err("the webview produced an empty PDF".to_string());
        }
        std::fs::write(&out_path, bytes).map_err(|e| format!("write pdf: {e}"))?;
        return Ok(());
    }
    // NOTE: the Linux + Windows arms below cannot be compiled on the macOS dev
    // box (their crates are target-gated and not even fetched here); they are
    // written against the documented APIs and compiled on the Linux/Windows CI,
    // then GUI-verified there. The macOS arm above is compiled + verified here.
    #[cfg(target_os = "linux")]
    {
        use webkit2gtk::PrintOperationExt;
        let out_path = path.to_string();
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        window
            .with_webview(move |webview| {
                // On Linux `inner()` is the wry-owned `webkit2gtk::WebView`.
                let wv = webview.inner();
                let print_op = webkit2gtk::PrintOperation::new(&wv);
                let settings = gtk::PrintSettings::new();
                settings.set("output-uri", Some(format!("file://{out_path}").as_str()));
                settings.set("output-file-format", Some("pdf"));
                print_op.set_print_settings(&settings);
                print_op.print();
                let _ = tx.send(Ok(()));
            })
            .map_err(|e| format!("could not access webview: {e}"))?;
        return rx
            .recv_timeout(Duration::from_secs(60))
            .map_err(|_| "PDF export timed out".to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
        use webview2_com::PrintToPdfCompletedHandler;
        use windows::core::{Interface, HSTRING};
        let out_path = path.to_string();
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        window
            .with_webview(move |webview| {
                let res = (|| -> Result<(), String> {
                    // On Windows `controller()` is the ICoreWebView2Controller.
                    let core = unsafe { webview.controller().CoreWebView2() }
                        .map_err(|e| e.to_string())?;
                    let core7: ICoreWebView2_7 = core.cast().map_err(|e| e.to_string())?;
                    let tx2 = tx.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(
                        move |hr, success| {
                            let _ = tx2.send(if hr.is_err() {
                                Err(format!("PrintToPdf failed: {hr:?}"))
                            } else if !success.as_bool() {
                                Err("PrintToPdf reported failure".to_string())
                            } else {
                                Ok(())
                            });
                            Ok(())
                        },
                    ));
                    unsafe { core7.PrintToPdf(&HSTRING::from(&out_path), None, &handler) }
                        .map_err(|e| e.to_string())
                })();
                if let Err(e) = res {
                    let _ = tx.send(Err(e));
                }
            })
            .map_err(|e| format!("could not access webview: {e}"))?;
        return rx
            .recv_timeout(Duration::from_secs(60))
            .map_err(|_| "PDF export timed out".to_string())?;
    }
    #[allow(unreachable_code)]
    {
        let _ = (window, path);
        Err("PDF export isn't available on this platform build yet.".to_string())
    }
}

/// Wipe the profile file so the next launcher boot routes back into
/// the first-run wizard. Called from the launcher's Settings panel.
#[tauri::command]
fn reset_profile(app: AppHandle) -> Result<(), String> {
    let path = profile_path(&app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Bring the launcher window (label "main") to the foreground. Called
/// by the in-editor Ctrl/Cmd-H shortcut so the user can pivot back to
/// the home view without alt-tabbing through the document list.
#[tauri::command]
fn focus_launcher_window(app: AppHandle) -> Result<(), String> {
    let Some(w) = app.get_webview_window("main") else {
        return Err("launcher window is not open".into());
    };
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
    Ok(())
}

#[tauri::command]
async fn save_document_as(
    app: AppHandle,
    state: tauri::State<'_, RecentsState>,
    suggested_name: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .set_file_name(&suggested_name)
        .save_file(move |p| {
            let _ = tx.send(p.and_then(|fp| fp.into_path().ok()));
        });
    let chosen = rx.recv().map_err(|e| e.to_string())?;
    let Some(path) = chosen else {
        return Ok(None);
    };
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    let s = path.to_string_lossy().to_string();
    touch_recent(&app, &state, &s);
    Ok(Some(s))
}

// --- Profile + Settings (first-run wizard data) -----------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Profile {
    name: String,
    /// HSL hue (0–360) used by the UI to derive an avatar background color
    /// when there's no `avatar_path`. Stored rather than derived so changing
    /// the name later doesn't change the avatar color.
    avatar_hue: u16,
    /// IANA time zone (e.g. "America/New_York"). None = use system tz at
    /// display time.
    #[serde(default)]
    timezone: Option<String>,
    /// Optional email — not validated, not sent anywhere. Used as a hint
    /// in document author fields if present.
    #[serde(default)]
    email: Option<String>,
    /// Absolute path to a user-selected avatar image inside the app config
    /// dir (we copy the original here so deleting the source doesn't break
    /// the avatar).
    #[serde(default)]
    avatar_path: Option<String>,
    created_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Settings {
    /// "system" | "light" | "dark"
    theme: String,
    /// Default directory shown by the open/save dialogs. None = OS default.
    default_save_dir: Option<String>,
    /// "ask" | "same" | "new" — drives the open-where modal.
    #[serde(default)]
    open_window_preference: Option<String>,
    /// Version of Casual Office the user last saw the "What's new" screen
    /// for. None = never seen.
    #[serde(default)]
    last_seen_version: Option<String>,
    /// Privacy mode — when on, every Casual Office window opts into
    /// platform-level "content protection" so OS screenshots and screen
    /// recordings produce black frames where the editor is. Honored on
    /// Windows (DwmSetWindowAttribute) and macOS (NSWindow
    /// sharingType=none). On Linux/WebKitGTK there is no equivalent API,
    /// so the flag is a stored preference but has no runtime effect —
    /// surface that clearly in the UI rather than implying false safety.
    #[serde(default)]
    privacy_mode: bool,
    /// Warn before closing a document window that has unsaved changes. When
    /// true (the default), the close-guard prompts; when false the user has
    /// opted to close dirty windows without confirmation. Defaults to true
    /// via `default_warn_on_unsaved_close` so older settings.json files
    /// (which predate this field) keep the safe behavior.
    #[serde(default = "default_warn_on_unsaved_close")]
    warn_on_unsaved_close: bool,
}

fn default_warn_on_unsaved_close() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            default_save_dir: None,
            open_window_preference: None,
            last_seen_version: None,
            privacy_mode: false,
            warn_on_unsaved_close: true,
        }
    }
}

fn profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir config dir: {e}"))?;
    Ok(dir.join("profile.json"))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir config dir: {e}"))?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
fn is_first_run(app: AppHandle) -> bool {
    profile_path(&app)
        .map(|p| !p.exists())
        .unwrap_or(true)
}

#[tauri::command]
fn get_profile(app: AppHandle) -> Option<Profile> {
    let p = profile_path(&app).ok()?;
    let bytes = std::fs::read(&p).ok()?;
    serde_json::from_slice(&bytes).ok()
}

#[tauri::command]
fn save_profile(app: AppHandle, mut profile: Profile) -> Result<Profile, String> {
    let trimmed = profile.name.trim().to_string();
    if trimmed.is_empty() {
        return Err("name is required".into());
    }
    profile.name = trimmed;
    if profile.created_at == 0 {
        profile.created_at = now_secs();
    }
    // Normalize optional fields — empty strings come over the wire as Some("")
    // from the form; persist them as None.
    profile.email = profile.email.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    profile.timezone = profile.timezone.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    let path = profile_path(&app)?;
    let bytes = serde_json::to_vec_pretty(&profile).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(profile)
}

/// Open a native image picker, copy the chosen file into the app config
/// dir as `avatar.<ext>`, and return the destination path. Returns Ok(None)
/// if the user cancels. The caller is responsible for updating the profile
/// to point at this path.
#[tauri::command]
async fn pick_avatar_image(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Option<PathBuf>>();
    app.dialog()
        .file()
        .add_filter("Image", &["png", "jpg", "jpeg", "webp", "gif"])
        .pick_file(move |p| {
            let _ = tx.send(p.and_then(|fp| fp.into_path().ok()));
        });
    let chosen = rx.recv().map_err(|e| e.to_string())?;
    let Some(src) = chosen else {
        return Ok(None);
    };
    // Cap avatar size at 5 MB. Anything larger is almost always the user
    // mistakenly picking a full-resolution photo; we read the file into JS
    // as a base64 data URL, and oversized images make that path very slow
    // (and bloat the data: URL cache).
    const MAX_AVATAR_BYTES: u64 = 5 * 1024 * 1024;
    if let Ok(meta) = std::fs::metadata(&src) {
        if meta.len() > MAX_AVATAR_BYTES {
            let mb = meta.len() as f64 / (1024.0 * 1024.0);
            return Err(format!(
                "Picture is too large ({mb:.1} MB). Pick an image under 5 MB."
            ));
        }
    }
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let cfg_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    std::fs::create_dir_all(&cfg_dir).map_err(|e| e.to_string())?;
    let dst = cfg_dir.join(format!("avatar.{ext}"));
    // Strip any older avatar files with different extensions so we have
    // exactly one avatar on disk.
    for stale_ext in ["png", "jpg", "jpeg", "webp", "gif"] {
        let stale = cfg_dir.join(format!("avatar.{stale_ext}"));
        if stale != dst && stale.exists() {
            let _ = std::fs::remove_file(stale);
        }
    }
    std::fs::copy(&src, &dst).map_err(|e| format!("copy avatar: {e}"))?;
    Ok(Some(dst.to_string_lossy().to_string()))
}

/// Read an image file off disk and return its bytes — the launcher renders
/// the avatar as a data: URL so we never expose raw filesystem paths to
/// the webview's `src` attribute (Tauri's asset protocol works but needs
/// per-asset capability; this is simpler for one small image).
#[tauri::command]
async fn read_avatar_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("read avatar {path}: {e}"))
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    let Some(path) = settings_path(&app).ok() else {
        return Settings::default();
    };
    let Ok(bytes) = std::fs::read(&path) else {
        return Settings::default();
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

/// Apply the privacy-mode flag to every open window. On Windows and
/// macOS this opts the window into the platform's "content protection"
/// path so OS screenshots and screen-recordings render the window as
/// black frames. On Linux there's no equivalent compositor API; the
/// call still returns Ok and the preference is preserved, but screenshots
/// will still capture the window content. Surface that limitation in
/// the Settings UI so users aren't misled.
///
/// Returns the list of window labels for which `set_content_protected`
/// returned an error, so the caller can surface a partial-failure to the
/// user rather than silently implying success.
fn apply_privacy_to_all_windows(app: &AppHandle, enabled: bool) -> Vec<String> {
    let mut failures = Vec::new();
    for window in app.webview_windows().values() {
        if let Err(e) = window.set_content_protected(enabled) {
            eprintln!(
                "privacy: set_content_protected({enabled}) failed for {}: {e}",
                window.label()
            );
            failures.push(window.label().to_string());
        }
    }
    failures
}

/// Apply the current privacy-mode flag live to every open window — the
/// launcher window ("main") and every "doc-*" document window. Called by
/// the Settings UI immediately after persisting the preference so toggling
/// privacy takes effect on already-open windows, not just future ones.
///
/// On macOS this drives `NSWindow.sharingType`; on Windows,
/// `DwmSetWindowAttribute`. On Linux/WebKitGTK there is no equivalent
/// compositor API so the call is a no-op there. If any window's call
/// errors, this returns Err with the affected labels so the UI can avoid
/// implying success.
#[tauri::command]
fn apply_privacy_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let failures = apply_privacy_to_all_windows(&app, enabled);
    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "content protection could not be applied to {} window(s): {}",
            failures.len(),
            failures.join(", ")
        ))
    }
}

/// Push the current theme mode to every open document window so already-open
/// editors switch live when the user changes the theme in the launcher. The
/// launcher owns the theme preference; editor windows only listen. Emits the
/// `deskapp://theme` event (payload `{ "theme": <mode> }`) to each webview
/// window whose label starts with `doc-`. The launcher window ("main")
/// re-themes itself locally via applyTheme and is intentionally skipped.
#[tauri::command]
fn broadcast_theme(app: AppHandle, mode: String) {
    for window in app.webview_windows().values() {
        if !window.label().starts_with("doc-") {
            continue;
        }
        let _ = window.emit("deskapp://theme", serde_json::json!({ "theme": mode }));
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let path = settings_path(&app)?;
    let bytes = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    // Best-effort live apply on save. The Settings UI also calls
    // `apply_privacy_mode` explicitly (so it can surface per-window
    // failures), but applying here too keeps any other save_settings
    // caller honest. Failures are logged inside the helper.
    let _ = apply_privacy_to_all_windows(&app, settings.privacy_mode);
    Ok(settings)
}

// --- File-association / single-instance handling --------------------------
//
// When the user double-clicks a .docx / .xlsx in the file manager, the OS
// launches Casual Office with the file path in argv (because of the
// `fileAssociations` block in tauri.conf.json). If Casual Office is already
// running, the OS still launches a second process; the
// `tauri-plugin-single-instance` plugin catches that, hands the second
// process's argv to the first via callback, and exits the second. Either
// way we end up opening the file in the running app.

/// Pull the first argv entry that looks like an existing path we support
/// (.docx, .xlsx, …). Skips argv[0] (the binary path) and any flags.
fn first_openable_path(args: &[String]) -> Option<String> {
    for arg in args.iter().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        if DocKind::from_path(arg).is_some() {
            return Some(arg.clone());
        }
    }
    None
}

/// Open the given file in a new document window. Called from setup() for
/// the initial argv path and from the single-instance handler for any
/// subsequent file-manager double-click.
fn open_file_path(app: &AppHandle, path: String) {
    let Some(kind) = DocKind::from_path(&path) else {
        return;
    };
    let id = WINDOW_SEQ.fetch_add(1, Ordering::SeqCst);
    let label = format!("doc-{id}");
    let title = format!(
        "{} — {}",
        kind.title_prefix(),
        std::path::Path::new(&path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&path)
    );
    let mut url = format!("{}?desk=1&file=", kind.subpath());
    url.push_str(&urlencoding_lite(&path));
    let theme = get_settings(app.clone()).theme;
    url.push_str("&theme=");
    url.push_str(&urlencoding_lite(&theme));

    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(1280.0, 860.0)
        .min_inner_size(720.0, 480.0)
        .resizable(true)
        .maximized(true)
        .focused(true)
        .build();

    // Linux focus-stealing prevention: when the user double-clicks a
    // file in their file manager, the file manager owns the WM's
    // "active app" stamp. set_focus() is demoted to an urgency hint
    // and the user has to alt-tab to start typing. Two reinforcements:
    //
    //   1. Brief always_on_top toggle — convinces the WM the raise is
    //      user-initiated. Fast editors (sheets / Univer) get focus
    //      from this alone.
    //   2. Repeat set_focus on a delay — for docx specifically, the
    //      PagedEditor + ProseMirror init takes 1.5–3 s with a real
    //      document, during which the page-load triggers focus events
    //      that the WM evaluates against an unmapped surface. By the
    //      time the editor is interactive, the file manager has won.
    //      Firing set_focus again at 250 / 800 / 1500 ms covers the
    //      mount window without leaving the user fighting for focus.
    if let Ok(window) = built {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        let _ = window.set_always_on_top(false);
        if get_settings(app.clone()).privacy_mode {
            let _ = window.set_content_protected(true);
        }
        attach_unsaved_guard(app, &window);
        // Watch the file for external rename/move/delete/modify while it's
        // open (best-effort; a watch failure never blocks the open).
        start_file_watch(app, &label, &path);
        let w = window.clone();
        std::thread::spawn(move || {
            for delay_ms in [250u64, 800, 1500] {
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                let _ = w.set_focus();
            }
        });
    }

    if let Some(state) = app.try_state::<RecentsState>() {
        touch_recent(app, &state, &path);
    }
}

#[tauri::command]
fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}


// --- App entry --------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second invocation arrived. Two cases:
            //   - `casual-office <file>` → open the file; DON'T raise the
            //     launcher (the user double-clicked a doc; the launcher
            //     popping up alongside is the "two windows" complaint).
            //   - bare `casual-office` → user re-launched the app itself;
            //     bring the launcher to front.
            if let Some(path) = first_openable_path(&args) {
                open_file_path(app, path);
                return;
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.unminimize();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let initial = load_recents(&app.handle());
            app.manage(RecentsState {
                list: Mutex::new(initial),
            });
            app.manage(SaveState::default());
            app.manage(DirtyState::default());
            app.manage(WatchState::default());

            // Guard the launcher window too. In same-window open mode the
            // launcher ("main") navigates in-place into the editor, so without
            // this a dirty document opened "in this window" would close with no
            // prompt. The guard only intercepts when the window is dirty, so a
            // clean home screen (dirty=false) still closes normally.
            if let Some(main) = app.get_webview_window("main") {
                attach_unsaved_guard(&app.handle(), &main);
            }
            // (Earlier prototype attached a native menu bar via
            // tauri::menu::Menu. Removed — visual treatment didn't fit
            // the launcher's home-screen layout. Keyboard shortcuts that
            // the menu provided still work via the in-page bindShortcuts
            // listener.)

            // Initial argv handling — the launcher window is declared
            // with visible: false in tauri.conf.json so we can decide
            // whether to show it based on what the user actually
            // wanted:
            //   - launched with a file path (file-manager double-click,
            //     `casual-office foo.docx`) → spawn the doc window and
            //     leave the launcher hidden. The user wanted to edit a
            //     file; popping up the home screen alongside is noise.
            //   - launched with no file path (clicking the app icon) →
            //     show the launcher.
            // Honor the saved privacy preference on the launcher window at
            // boot so "main" is content-protected from first paint, not just
            // after the user re-toggles the setting.
            if get_settings(app.handle().clone()).privacy_mode {
                let _ = apply_privacy_to_all_windows(&app.handle(), true);
            }

            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = first_openable_path(&args) {
                open_file_path(&app.handle(), path);
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_document_window,
            get_recent_files,
            clear_recent_files,
            add_recent_file,
            remove_recent_file,
            set_recent_pinned,
            load_document,
            document_size,
            read_document_chunk,
            file_exists,
            reveal_in_folder,
            save_document,
            save_document_as,
            begin_save_document,
            write_save_chunk,
            commit_save_document,
            set_window_dirty,
            pick_save_path,
            export_pdf,
            write_recovery,
            read_recovery,
            clear_recovery,
            pending_recoveries,
            reset_profile,
            focus_launcher_window,
            is_first_run,
            get_profile,
            save_profile,
            pick_avatar_image,
            read_avatar_bytes,
            get_settings,
            save_settings,
            apply_privacy_mode,
            broadcast_theme,
            get_app_version,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS file associations do NOT pass the path in argv — the OS
            // sends an Apple Event that Tauri surfaces as `RunEvent::Opened`.
            // Without this arm, right-click → "Open with Casual Office" (and
            // double-click on a registered type) launches the app but the file
            // path is dropped, so no editor window ever opens. The argv path in
            // setup()/single-instance only covers Linux + Windows. (Gated to
            // macOS/iOS — `RunEvent::Opened` only exists / fires there.)
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Some(p) = path.to_str() {
                            if DocKind::from_path(p).is_some() {
                                open_file_path(_app, p.to_string());
                            }
                        }
                    }
                }
            }
        });
}

fn urlencoding_lite(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        let is_safe = matches!(
            b,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/'
        );
        if is_safe {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

// --- Atomic-save state-machine tests -----------------------------------------
//
// The chunked save (begin → write* → commit) is the single most data-critical
// path in the shell: a bug here can truncate or corrupt the user's real file.
// These exercise the real filesystem behaviour (not mocks) of the extracted
// `*_impl` helpers, with emphasis on the safety invariant: the real file is
// only touched by the final atomic rename, so an aborted save never damages it.
#[cfg(test)]
mod save_tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static TEST_SEQ: AtomicU32 = AtomicU32::new(0);

    /// Unique temp dir per test; removed on drop. Keeps the temp file and the
    /// real file as siblings on one filesystem (mirrors production layout).
    struct TestDir(PathBuf);
    impl TestDir {
        fn new() -> Self {
            let n = TEST_SEQ.fetch_add(1, Ordering::SeqCst);
            let dir = std::env::temp_dir()
                .join(format!("casualoffice-save-test-{}-{}", std::process::id(), n));
            std::fs::create_dir_all(&dir).unwrap();
            TestDir(dir)
        }
        /// Path string for a file inside this dir.
        fn file(&self, name: &str) -> String {
            self.0.join(name).to_string_lossy().into_owned()
        }
    }
    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn temp_path_is_a_sibling_with_expected_suffix() {
        // EXDEV avoidance: the temp must share the real file's parent dir so
        // the final rename stays on one filesystem.
        let tmp = save_temp_path("/home/user/Reports/q3.xlsx");
        assert_eq!(tmp, PathBuf::from("/home/user/Reports/q3.xlsx.casualoffice.tmp"));
        assert_eq!(tmp.parent(), PathBuf::from("/home/user/Reports/q3.xlsx").parent());
    }

    #[test]
    fn full_cycle_writes_exact_bytes_and_removes_temp() {
        let dir = TestDir::new();
        let path = dir.file("out.bin");
        let state = SaveState::default();
        let data = b"hello atomic save".to_vec();

        begin_save_impl(&state, path.clone()).unwrap();
        write_save_chunk_impl(&state, path.clone(), 0, data.clone()).unwrap();
        commit_save_impl(&state, path.clone()).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), data);
        // Temp is consumed by the rename, and the state entry is cleared.
        assert!(!save_temp_path(&path).exists(), "temp should be gone after commit");
        assert!(state.in_progress.lock().unwrap().is_empty());
    }

    #[test]
    fn abort_without_commit_leaves_real_file_untouched() {
        // THE safety invariant: a save that begins + writes but never commits
        // must not modify (or create) the real file. Only the temp is dirtied.
        let dir = TestDir::new();
        let path = dir.file("precious.docx");
        std::fs::write(&path, b"ORIGINAL CONTENT").unwrap();
        let state = SaveState::default();

        begin_save_impl(&state, path.clone()).unwrap();
        write_save_chunk_impl(&state, path.clone(), 0, b"new junk that never commits".to_vec())
            .unwrap();
        // ...crash/abort here — no commit.

        assert_eq!(
            std::fs::read(&path).unwrap(),
            b"ORIGINAL CONTENT",
            "real file must be untouched until commit"
        );
        assert!(save_temp_path(&path).exists(), "temp holds the uncommitted bytes");
    }

    #[test]
    fn commit_replaces_existing_file_atomically() {
        let dir = TestDir::new();
        let path = dir.file("doc.xlsx");
        std::fs::write(&path, b"v1 old bytes").unwrap();
        let state = SaveState::default();
        let v2 = b"v2 brand new bytes, longer than v1".to_vec();

        begin_save_impl(&state, path.clone()).unwrap();
        write_save_chunk_impl(&state, path.clone(), 0, v2.clone()).unwrap();
        commit_save_impl(&state, path.clone()).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), v2);
    }

    #[test]
    fn out_of_order_chunks_assemble_by_offset() {
        // Chunks may arrive in any order; offset positioning must reassemble
        // the byte stream correctly.
        let dir = TestDir::new();
        let path = dir.file("chunked.bin");
        let state = SaveState::default();

        begin_save_impl(&state, path.clone()).unwrap();
        // Write the second half first, then the first half.
        write_save_chunk_impl(&state, path.clone(), 5, b"world".to_vec()).unwrap();
        write_save_chunk_impl(&state, path.clone(), 0, b"hello".to_vec()).unwrap();
        commit_save_impl(&state, path.clone()).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"helloworld");
    }

    #[test]
    fn classify_fs_event_maps_only_actionable_kinds() {
        use notify::event::{
            AccessKind, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind, RenameMode,
        };
        use notify::EventKind;

        // Removal → "removed".
        assert_eq!(
            classify_fs_event(&EventKind::Remove(RemoveKind::File)),
            Some("removed")
        );
        // Name-change variants → "renamed".
        assert_eq!(
            classify_fs_event(&EventKind::Modify(ModifyKind::Name(RenameMode::From))),
            Some("renamed")
        );
        assert_eq!(
            classify_fs_event(&EventKind::Modify(ModifyKind::Name(RenameMode::Both))),
            Some("renamed")
        );
        // Content change → "modified".
        assert_eq!(
            classify_fs_event(&EventKind::Modify(ModifyKind::Data(DataChange::Content))),
            Some("modified")
        );
        // Noise we deliberately ignore.
        assert_eq!(
            classify_fs_event(&EventKind::Access(AccessKind::Read)),
            None
        );
        assert_eq!(
            classify_fs_event(&EventKind::Create(CreateKind::File)),
            None
        );
        assert_eq!(
            classify_fs_event(&EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any))),
            None
        );
    }

    #[test]
    fn commit_falls_back_to_deterministic_temp_when_state_lost() {
        // write/commit derive the temp path deterministically when the in-memory
        // map entry is missing (e.g. state dropped mid-save), so a save can still
        // finalize rather than silently failing.
        let dir = TestDir::new();
        let path = dir.file("resilient.bin");
        let state = SaveState::default();

        begin_save_impl(&state, path.clone()).unwrap();
        write_save_chunk_impl(&state, path.clone(), 0, b"survives state loss".to_vec()).unwrap();
        // Simulate lost tracking state: clear the map before commit.
        state.in_progress.lock().unwrap().clear();
        commit_save_impl(&state, path.clone()).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"survives state loss");
        assert!(!save_temp_path(&path).exists());
    }
}
