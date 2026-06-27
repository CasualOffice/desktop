import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// =============================================================================
// Types
// =============================================================================

type DocKind = 'docx' | 'sheets';

interface RecentFile {
  path: string;
  kind: DocKind;
  last_opened: number;
  pinned: boolean;
}

interface Profile {
  name: string;
  avatar_hue: number;
  timezone: string | null;
  email: string | null;
  avatar_path: string | null;
  created_at: number;
}

interface Settings {
  theme: 'system' | 'light' | 'dark';
  default_save_dir: string | null;
  /** "ask" (show modal every time), "same", "new" — populated by the
   *  "Remember my choice" checkbox in the open-where dialog. */
  open_window_preference?: 'ask' | 'same' | 'new';
  /** Last app version the user saw the "What's new" modal for. */
  last_seen_version?: string | null;
  /** Privacy mode — see Rust-side struct docs. On Linux this is a
   *  stored preference only; OS-level content protection is not
   *  available through the compositor. */
  privacy_mode?: boolean;
  /** Warn before closing a document window with unsaved changes.
   *  Defaults to true on the Rust side. */
  warn_on_unsaved_close?: boolean;
  /** Check GitHub releases for a newer version on launch and offer to
   *  install it. Defaults to true on the Rust side. */
  auto_update?: boolean;
}

/**
 * Inline release notes, newest first. Shown via the "What's new" modal
 * on the first launch after the app's CARGO_PKG_VERSION moves past
 * `settings.last_seen_version`. Keep entries short and concrete.
 */
const CHANGELOG: ReadonlyArray<{ version: string; title: string; highlights: string[] }> = [
  {
    version: '0.0.0',
    title: 'Welcome to Casual Office',
    highlights: [
      'Edit Word (.docx), text (.txt, .md) and Excel (.xlsx, .ods, .csv, .tsv) files locally — nothing leaves your machine.',
      'One native window per document — same speed and isolation as Excel or Word.',
      'Save writes back to the original file; Save As always prompts for a new location.',
      'Profile + settings with custom picture, theme, and default save folder.',
      'Set Casual Office as the default app in your OS to open documents directly from the file manager.',
    ],
  },
];

// =============================================================================
// Tiny helpers
// =============================================================================

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(0, i) : '';
}

function relTime(epochSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSecs;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function kindFromPath(path: string): DocKind | null {
  const lower = path.toLowerCase();
  if (
    lower.endsWith('.docx') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown')
  )
    return 'docx';
  if (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xlsm') ||
    lower.endsWith('.ods') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv') ||
    lower.endsWith('.tab')
  ) {
    return 'sheets';
  }
  return null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function applyTheme(theme: Settings['theme']) {
  document.documentElement.dataset.theme = theme;
}

/** True on Linux/WebKitGTK, where the "hide window from screenshots" content-
 *  protection path is a no-op (no compositor API). Android also reports Linux
 *  in the UA, so exclude it. Used to disable the privacy toggle there rather
 *  than letting the user flip a switch that protects nothing on their OS. */
function isLinuxDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Linux/.test(ua) && !/Android/.test(ua);
}

/** Push the new theme mode to every already-open document window so their
 *  editors switch live. Fire-and-forget; the launcher itself re-themes via
 *  the local applyTheme call. */
function broadcastTheme(mode: Settings['theme']) {
  invoke('broadcast_theme', { mode }).catch((err) => {
    console.warn('broadcast_theme failed', err);
  });
}

/** Mirror each radio's checked state onto its wrapping .theme-card's
 *  aria-checked, so the role="radio" labels expose correct state to AT. */
function syncThemeCardAria() {
  for (const card of document.querySelectorAll<HTMLElement>('.theme-card[role=radio]')) {
    const input = card.querySelector<HTMLInputElement>('input[type=radio]');
    card.setAttribute('aria-checked', input?.checked ? 'true' : 'false');
  }
}

let statusClearTimer: ReturnType<typeof setTimeout> | null = null;

/** Update the home-panel status line. Pass a non-zero `clearAfterMs` to
 *  make the message transient (it reverts to empty after the delay) — used
 *  for ephemeral "Opening …" / "Opened …" feedback so the line isn't dead
 *  UI. A persistent message (clearAfterMs = 0) is used for the boot error. */
function setStatus(msg: string, clearAfterMs = 0) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  if (statusClearTimer) {
    clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }
  if (clearAfterMs > 0) {
    statusClearTimer = setTimeout(() => {
      el.textContent = '';
      statusClearTimer = null;
    }, clearAfterMs);
  }
}

// =============================================================================
// Toast — bottom-right transient notification. Auto-dismisses.
// =============================================================================

type ToastKind = 'default' | 'success' | 'error';

function toast(message: string, kind: ToastKind = 'default', durationMs = 3000) {
  const container = document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast${kind === 'default' ? '' : ` ${kind}`}`;
  el.textContent = message;
  container.appendChild(el);
  const dismiss = () => {
    el.classList.add('leaving');
    el.addEventListener(
      'animationend',
      () => el.remove(),
      { once: true },
    );
  };
  setTimeout(dismiss, durationMs);
  el.addEventListener('click', dismiss);
}

/**
 * Toast with a single inline action button (e.g. "Undo", "Retry"). The
 * action button doesn't dismiss on the container-click path — only the
 * body text does — so the user can click the action without racing the
 * auto-dismiss. Returns a handle to dismiss early.
 */
function actionToast(
  message: string,
  actionLabel: string,
  onAction: () => void,
  kind: ToastKind = 'default',
  durationMs = 6000,
): { dismiss: () => void } {
  const container = document.getElementById('toasts');
  if (!container) return { dismiss: () => undefined };
  const el = document.createElement('div');
  el.className = `toast${kind === 'default' ? '' : ` ${kind}`}`;
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-action';
  btn.textContent = actionLabel;
  el.appendChild(text);
  el.appendChild(btn);
  container.appendChild(el);
  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const timer = setTimeout(dismiss, durationMs);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(timer);
    onAction();
    dismiss();
  });
  // Clicking the text (not the button) dismisses early.
  text.addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
  });
  return { dismiss };
}

// =============================================================================
// Friendly error mapping — Rust commands return raw strings (often the OS
// errno text). Wrap them into something a user can act on, and always
// include the file label so a toast in the corner is self-explanatory.
// =============================================================================

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('enoent') || lower.includes('no such file') || lower.includes('not found')) {
    return 'the file no longer exists at that location.';
  }
  if (lower.includes('eacces') || lower.includes('permission denied') || lower.includes('access is denied')) {
    return 'permission was denied — check the file or folder permissions.';
  }
  if (lower.includes('ebusy') || lower.includes('in use') || lower.includes('locked')) {
    return 'the file is open in another program.';
  }
  if (lower.includes('enospc') || lower.includes('no space')) {
    return 'there is not enough disk space.';
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'the operation timed out.';
  }
  return raw || 'an unexpected error occurred.';
}

/** `Could not open "<name>": <friendly>` — used for open + save toasts. */
function fileErrorMessage(verb: string, label: string, err: unknown): string {
  return `${verb} “${label}”: ${friendlyError(err)}`;
}

/**
 * Launcher-side pre-flight validation of a file we're about to hand to an
 * editor window. Catches the two failures that otherwise only surface *inside*
 * the editor (UX-AUDIT §3):
 *   1. the path no longer exists / isn't readable, and
 *   2. a ZIP-based Office file (.docx/.xlsx/.xlsm/.ods) whose first bytes
 *      aren't the ZIP local-file-header magic "PK\x03\x04" — i.e. a renamed
 *      legacy OLE .doc/.xls, a truncated download, or an unrelated file with
 *      the wrong extension. The editors sniff this too and error, but only
 *      after a cold-start; catching it here gives an immediate, friendly,
 *      launcher-side message and avoids spawning a window that just shows an
 *      error.
 *
 * Plain-text family files (.txt/.md/.csv/.tsv/.tab) have no signature, so we
 * only check existence for them. Returns a human-facing reason string when the
 * file can't be opened, or null when it looks openable. Any unexpected IPC
 * failure returns null (fail-open) so a flaky check never blocks a legitimate
 * open — the editor remains the final arbiter.
 */
async function preflightOpenError(path: string): Promise<string | null> {
  // 1. Existence.
  try {
    const exists = await invoke<boolean>('file_exists', { path });
    if (!exists) return 'the file no longer exists at that location.';
  } catch {
    return null; // fail-open: let the editor try.
  }

  // 2. ZIP magic for the OOXML / ODF container formats.
  const ext = path.toLowerCase().split('.').pop() ?? '';
  const zipBased = ext === 'docx' || ext === 'xlsx' || ext === 'xlsm' || ext === 'ods';
  if (!zipBased) return null;

  try {
    const head = await invoke<number[]>('read_document_chunk', {
      path,
      offset: 0,
      length: 4,
    });
    // Empty file: nothing for the editor to parse — flag it now.
    if (head.length === 0) return 'the file is empty.';
    // A valid ZIP container starts with "PK\x03\x04" (local file header) or,
    // for an empty archive, "PK\x05\x06". Anything else with these extensions
    // is almost always a legacy OLE .doc/.xls renamed, or a corrupt file.
    const isPk = head[0] === 0x50 && head[1] === 0x4b; // "PK"
    const isLocalHeader = isPk && head[2] === 0x03 && head[3] === 0x04;
    const isEmptyArchive = isPk && head[2] === 0x05 && head[3] === 0x06;
    // OLE compound-file (old .doc/.xls) magic: D0 CF 11 E0.
    const isOle =
      head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
    if (isOle) {
      return 'this looks like an older Office format (.doc/.xls), which isn’t supported — re-save it as .docx/.xlsx.';
    }
    if (!isLocalHeader && !isEmptyArchive) {
      return 'the file appears to be corrupt or isn’t a real Office document.';
    }
  } catch {
    return null; // fail-open on a read hiccup.
  }
  return null;
}

// =============================================================================
// In-app confirm modal — reuses the .modal / .modal-backdrop visual
// language. Resolves true on confirm, false on cancel / Escape / backdrop.
// =============================================================================

/** Focus trap for modals: on Tab/Shift+Tab, keep focus cycling within
 *  `container`'s visible, enabled focusables instead of escaping to the page
 *  behind the backdrop. Call from the modal's keydown handler; no-op for
 *  non-Tab keys. */
function trapTabKey(e: KeyboardEvent, container: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const list = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  if (list.length === 0) return;
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey) {
    if (active === first || !container.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last || !container.contains(active)) {
    e.preventDefault();
    first.focus();
  }
}

function confirmDialog(opts: {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">${escapeHtml(opts.title)}</h2>
        <p class="sub">${escapeHtml(opts.body)}</p>
        <div class="modal-actions">
          <button class="link" data-act="cancel" type="button">${escapeHtml(opts.cancelLabel ?? 'Cancel')}</button>
          <span class="spacer"></span>
          <button data-act="confirm" type="button"${opts.danger ? ' class="danger"' : ''}>${escapeHtml(opts.confirmLabel ?? 'Confirm')}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const modalEl = backdrop.querySelector<HTMLElement>('.modal')!;
    const confirmBtn = backdrop.querySelector<HTMLButtonElement>('[data-act=confirm]')!;
    const cancelBtn = backdrop.querySelector<HTMLButtonElement>('[data-act=cancel]')!;
    const finish = (result: boolean) => {
      window.removeEventListener('keydown', onKey);
      backdrop.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else {
        trapTabKey(e, modalEl);
      }
    };
    confirmBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));
    // Backdrop click (outside the modal) cancels.
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) finish(false);
    });
    window.addEventListener('keydown', onKey);
    setTimeout(() => confirmBtn.focus(), 0);
  });
}

/**
 * Fire-and-forget IPC for a state-changing action that should warn (subtly)
 * if it didn't persist. Use only for user-initiated mutations — not for
 * read-only refreshes.
 */
function persistOrWarn(promise: Promise<unknown>, what: string) {
  promise.catch((err) => {
    console.error(`${what} failed to persist`, err);
    toast(`${what} may not have been saved.`, 'error', 4000);
  });
}

/**
 * Copy text to the clipboard, preferring the browser clipboard API (works
 * inside the Tauri webview) and falling back to a hidden-textarea +
 * execCommand for older WebKitGTK builds that gate navigator.clipboard.
 * Shows a transient toast either way.
 */
async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast('Path copied', 'success');
      return;
    }
  } catch (err) {
    console.warn('navigator.clipboard.writeText failed; falling back', err);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? 'Path copied' : 'Couldn’t copy path', ok ? 'success' : 'error');
  } catch (err) {
    console.error('clipboard fallback failed', err);
    toast('Couldn’t copy path', 'error');
  }
}

// =============================================================================
// State
// =============================================================================

const state = {
  profile: null as Profile | null,
  settings: { theme: 'system', default_save_dir: null } as Settings,
};

function openOrReplaceLauncher(kind: DocKind, filePath: string | null) {
  // For a file-backed open, run a launcher-side pre-flight so a missing or
  // clearly-corrupt file is caught here with a friendly message instead of
  // only inside a freshly-spawned editor window (UX-AUDIT §3). New/untitled
  // documents (filePath === null) have nothing to validate — open directly.
  if (filePath) {
    void preflightOpenError(filePath).then((reason) => {
      if (reason) {
        const label = basename(filePath);
        toast(`Can’t open “${label}”: ${reason}`, 'error', 5500);
        setStatus(`Couldn’t open ${label}`, 4000);
        return;
      }
      proceedOpen(kind, filePath);
    });
    return;
  }
  proceedOpen(kind, filePath);
}

/** Route an open (already validated, if file-backed) through the user's
 *  open-where preference / dialog. */
function proceedOpen(kind: DocKind, filePath: string | null) {
  const pref = state.settings.open_window_preference ?? 'ask';
  if (pref === 'same') return doOpen(kind, filePath, 'same');
  if (pref === 'new') return doOpen(kind, filePath, 'new');
  askOpenChoice(kind, filePath);
}

function doOpen(kind: DocKind, filePath: string | null, where: 'same' | 'new') {
  if (filePath) {
    invoke('add_recent_file', { path: filePath }).catch(() => undefined);
  }
  if (where === 'same') {
    const params = new URLSearchParams({ desk: '1' });
    if (filePath) params.set('file', filePath);
    // Navigate the launcher window to the editor. The user can use
    // Alt+Left / Cmd+[ to return to the home screen.
    window.location.href = `${kind}/index.html?${params.toString()}`;
    return;
  }
  const label = filePath
    ? filePath.split(/[\\/]/).pop()
    : kind === 'docx'
      ? 'New document'
      : 'New spreadsheet';
  setStatus(`Opening ${label}…`);
  invoke('open_document_window', { kind, filePath })
    .then(() => {
      refreshRecents();
      toast(`Opened ${label}`, 'success');
      setStatus(`Opened ${label}`, 2500);
    })
    .catch((err) => {
      console.error('open_document_window failed', err);
      toast(fileErrorMessage('Could not open', label ?? 'document', err), 'error', 5000);
      setStatus(`Couldn’t open ${label}`, 4000);
    });
}

/**
 * Open every supported file from a drag-drop. A multi-file drop is inherently
 * multi-window — opening "in this window" would have each navigation clobber
 * the previous, so >1 file forces a new window per document regardless of the
 * open-where preference. A single file honors the user's preference.
 * Unsupported paths are ignored.
 */
function handleDrop(paths: string[]) {
  const supported: Array<{ kind: DocKind; path: string }> = [];
  for (const p of paths) {
    const kind = kindFromPath(p);
    if (kind) supported.push({ kind, path: p });
  }
  if (supported.length > 1) {
    for (const { kind, path } of supported) doOpen(kind, path, 'new');
  } else if (supported.length === 1) {
    openOrReplaceLauncher(supported[0].kind, supported[0].path);
  }
}

function askOpenChoice(kind: DocKind, filePath: string | null) {
  const modal = $('open-choice');
  const remember = $<HTMLInputElement>('open-choice-remember');
  const sub = $('open-choice-sub');
  const label = filePath ? filePath.split(/[\\/]/).pop() : kind === 'docx' ? 'New document' : 'New spreadsheet';
  sub.textContent = label ? `Open “${label}” in:` : 'Open in:';
  remember.checked = false;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  modal.hidden = false;
  // Default focus on the primary action so Enter activates it.
  setTimeout(() => $<HTMLButtonElement>('open-choice-same').focus(), 0);

  const sameBtn = $<HTMLButtonElement>('open-choice-same');
  const newBtn = $<HTMLButtonElement>('open-choice-new');
  const cancelBtn = $<HTMLButtonElement>('open-choice-cancel');
  const cleanup = () => {
    modal.hidden = true;
    sameBtn.removeEventListener('click', onSame);
    newBtn.removeEventListener('click', onNew);
    cancelBtn.removeEventListener('click', onCancel);
    modal.removeEventListener('mousedown', onBackdrop);
    window.removeEventListener('keydown', onKey);
    // Return focus to whatever opened the dialog.
    previouslyFocused?.focus?.();
  };
  const persistIfRemembered = (choice: 'same' | 'new') => {
    if (remember.checked) {
      const next: Settings = { ...state.settings, open_window_preference: choice };
      state.settings = next;
      persistOrWarn(invoke('save_settings', { settings: next }), 'Window preference');
    }
  };
  const onSame = () => {
    persistIfRemembered('same');
    cleanup();
    doOpen(kind, filePath, 'same');
  };
  const onNew = () => {
    persistIfRemembered('new');
    cleanup();
    doOpen(kind, filePath, 'new');
  };
  const onCancel = () => cleanup();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    } else {
      trapTabKey(e, modal);
    }
  };
  // Click on the backdrop (outside the .modal box) cancels.
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === modal) cleanup();
  };
  sameBtn.addEventListener('click', onSame);
  newBtn.addEventListener('click', onNew);
  cancelBtn.addEventListener('click', onCancel);
  modal.addEventListener('mousedown', onBackdrop);
  window.addEventListener('keydown', onKey);
}

// =============================================================================
// Launcher home-panel actions
// =============================================================================

/** Cache of the last-fetched recent list — used by the search filter to
 *  re-render without re-hitting Rust on every keystroke. */
let lastRecentList: RecentFile[] = [];
let recentSearchQuery = '';
let recentTypeFilter: 'all' | 'docx' | 'sheets' = 'all';
/** Tracks the recents fetch lifecycle so render can show a loading
 *  spinner or a distinct error state instead of the empty placeholder. */
let recentsLoadState: 'idle' | 'loading' | 'error' = 'idle';

/** Paths whose recent card was clicked very recently. Used to debounce
 *  rapid double/triple-clicks so we don't queue several open commands for
 *  the same file. A path is locked for ~500ms after the first click. */
const recentClickLock = new Set<string>();

/** Stable "what bucket does this file belong in" classifier. Office's
 *  Backstage view groups recent files the same way. */
function groupKeyFor(epochSecs: number): string {
  const now = new Date();
  const then = new Date(epochSecs * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 86400_000;
  const diffDays = Math.floor((startOfToday - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / oneDay);
  if (epochSecs * 1000 >= startOfToday) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'this-week';
  if (diffDays <= 30) return 'this-month';
  return 'older';
}

const GROUP_LABELS: Record<string, string> = {
  pinned: 'Pinned',
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'Earlier this week',
  'this-month': 'Earlier this month',
  older: 'Older',
};

const GROUP_ORDER = ['pinned', 'today', 'yesterday', 'this-week', 'this-month', 'older'];

/** Stylized file icon — a 40×52 "page" shape (blue for docx, green for
 *  xlsx) with simulated content lines / grid. Not a real thumbnail, but
 *  visually consistent with how Office's Backstage represents files. */
function fileIconSvg(kind: DocKind): string {
  if (kind === 'docx') {
    return `
<svg class="file-icon" viewBox="0 0 40 52" aria-hidden="true">
  <rect x="0.5" y="0.5" width="39" height="51" rx="3" ry="3" fill="#fff" stroke="#2563eb33"/>
  <rect x="0.5" y="0.5" width="39" height="10" rx="3" ry="3" fill="#2563eb"/>
  <rect x="6" y="18" width="28" height="2.5" rx="1" fill="#2563eb55"/>
  <rect x="6" y="24" width="22" height="2.5" rx="1" fill="#2563eb44"/>
  <rect x="6" y="30" width="26" height="2.5" rx="1" fill="#2563eb44"/>
  <rect x="6" y="36" width="18" height="2.5" rx="1" fill="#2563eb44"/>
  <rect x="6" y="42" width="24" height="2.5" rx="1" fill="#2563eb44"/>
</svg>`;
  }
  return `
<svg class="file-icon" viewBox="0 0 40 52" aria-hidden="true">
  <rect x="0.5" y="0.5" width="39" height="51" rx="3" ry="3" fill="#fff" stroke="#1e7a4f33"/>
  <rect x="0.5" y="0.5" width="39" height="10" rx="3" ry="3" fill="#1e7a4f"/>
  <g stroke="#1e7a4f55" stroke-width="0.8">
    <line x1="6" y1="20" x2="34" y2="20"/>
    <line x1="6" y1="28" x2="34" y2="28"/>
    <line x1="6" y1="36" x2="34" y2="36"/>
    <line x1="6" y1="44" x2="34" y2="44"/>
    <line x1="16" y1="16" x2="16" y2="48"/>
    <line x1="26" y1="16" x2="26" y2="48"/>
  </g>
</svg>`;
}

/** Short, human-facing type label for a recent entry, derived from the
 *  file extension so a .csv reads "CSV" rather than the generic
 *  "Spreadsheet". Falls back to the editor family for unknown cases. */
function typeLabelFor(path: string, kind: DocKind): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  const byExt: Record<string, string> = {
    docx: 'Word',
    txt: 'Text',
    md: 'Markdown',
    markdown: 'Markdown',
    xlsx: 'Excel',
    xlsm: 'Excel',
    ods: 'Calc',
    csv: 'CSV',
    tsv: 'TSV',
    tab: 'TSV',
  };
  return byExt[ext] ?? (kind === 'docx' ? 'Document' : 'Spreadsheet');
}

async function refreshRecents() {
  // Only show the loading state when we have nothing to display yet —
  // a background refresh over an existing list shouldn't blank it out.
  if (lastRecentList.length === 0) {
    recentsLoadState = 'loading';
    renderRecents();
  }
  try {
    lastRecentList = await invoke<RecentFile[]>('get_recent_files');
    recentsLoadState = 'idle';
    renderRecents();
  } catch (err) {
    console.error('refreshRecents failed', err);
    recentsLoadState = 'error';
    renderRecents();
    toast('Couldn’t load recent files.', 'error', 4000);
  }
}

function renderRecents() {
  const recent = $('recent');
  const empty = $('empty');
  const noMatch = $('recent-no-match');
  const loading = $('recent-loading');
  const errorEl = $('recent-error');
  const groupsEl = $('recent-groups');
  groupsEl.innerHTML = '';

  // Loading: nothing cached yet, fetch in flight.
  if (recentsLoadState === 'loading') {
    recent.hidden = true;
    empty.hidden = true;
    loading.hidden = false;
    errorEl.hidden = true;
    return;
  }
  loading.hidden = true;

  // Error: the fetch failed and we have nothing to show.
  if (recentsLoadState === 'error' && lastRecentList.length === 0) {
    recent.hidden = true;
    empty.hidden = true;
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;

  if (lastRecentList.length === 0) {
    recent.hidden = true;
    empty.hidden = false;
    noMatch.hidden = true;
    return;
  }
  recent.hidden = false;
  empty.hidden = true;

  // Apply filters
  const q = recentSearchQuery.trim().toLowerCase();
  const matches = lastRecentList.filter((f) => {
    if (recentTypeFilter !== 'all' && f.kind !== recentTypeFilter) return false;
    if (q) {
      if (
        !f.path.toLowerCase().includes(q) &&
        !basename(f.path).toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  if (matches.length === 0) {
    noMatch.hidden = false;
    return;
  }
  noMatch.hidden = true;

  // Group: pinned files go in their own bucket regardless of recency.
  const groups = new Map<string, RecentFile[]>();
  for (const f of matches) {
    const key = f.pinned ? 'pinned' : groupKeyFor(f.last_opened);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  for (const key of GROUP_ORDER) {
    const list = groups.get(key);
    if (!list || list.length === 0) continue;
    const section = document.createElement('div');
    section.className = 'recent-group';

    const heading = document.createElement('div');
    heading.className = 'recent-group-head';
    heading.innerHTML = `<h3>${escapeHtml(GROUP_LABELS[key] ?? key)}</h3><span class="recent-group-count">${list.length}</span>`;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'recent-grid';
    for (const f of list) {
      // A relative wrapper so the "more actions" (⋯) button can sit in the
      // card's top-right corner — a <button> can't legally nest inside the
      // card <button>, so it's a sibling layered over it on hover/focus.
      const wrap = document.createElement('div');
      wrap.className = 'recent-card-wrap';

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `recent-card${f.pinned ? ' pinned' : ''}`;
      card.title = f.path;
      // The directory path is selectable so a user can copy it directly;
      // the "Copy path" context-menu item covers the whole path.
      card.innerHTML = `
        ${fileIconSvg(f.kind)}
        <div class="recent-card-meta">
          <div class="recent-card-name">
            ${f.pinned ? '<span class="pin-mark" aria-label="Pinned">★</span>' : ''}
            ${escapeHtml(basename(f.path))}
          </div>
          <div class="recent-card-path">${escapeHtml(dirname(f.path))}</div>
          <div class="recent-card-footer">
            <span class="recent-type-badge ${f.kind}">${escapeHtml(typeLabelFor(f.path, f.kind))}</span>
            <span class="recent-card-time">${escapeHtml(relTime(f.last_opened))}</span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => openRecent(f));
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openRecentContextMenu(f, e.clientX, e.clientY);
      });

      // "More actions" affordance — visible on card hover/focus, always
      // reachable by keyboard. Opens the same context menu as right-click,
      // anchored under the button.
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'recent-card-more';
      more.setAttribute('aria-label', `More actions for ${basename(f.path)}`);
      more.title = 'More actions';
      more.textContent = '⋯';
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = more.getBoundingClientRect();
        openRecentContextMenu(f, r.left, r.bottom + 2);
      });

      wrap.appendChild(card);
      wrap.appendChild(more);
      grid.appendChild(wrap);
    }
    section.appendChild(grid);
    groupsEl.appendChild(section);
  }
}

/**
 * Show a context menu for a recent-file entry. Pinned to the click
 * coordinates; first item is focused so Enter activates the primary
 * action; Esc or click-outside dismisses.
 */
function openRecentContextMenu(f: RecentFile, x: number, y: number) {
  closeAnyContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  const items: Array<{ label: string; run: () => void; primary?: boolean; divider?: boolean }> = [
    { label: 'Open', run: () => openRecent(f), primary: true },
    {
      label: 'Open in new window',
      run: async () => {
        // Same launcher-side pre-flight as the normal open path so a
        // missing/corrupt file is caught before a window is spawned.
        const reason = await preflightOpenError(f.path);
        if (reason) {
          toast(`Can’t open “${basename(f.path)}”: ${reason}`, 'error', 5500);
          return;
        }
        invoke('add_recent_file', { path: f.path }).catch(() => undefined);
        invoke('open_document_window', { kind: f.kind, filePath: f.path })
          .then(() => toast(`Opened ${basename(f.path)}`, 'success'))
          .catch((err) =>
            toast(fileErrorMessage('Could not open', basename(f.path), err), 'error', 4500),
          );
      },
    },
    {
      label: f.pinned ? 'Unpin from top' : 'Pin to top',
      run: async () => {
        try {
          await invoke('set_recent_pinned', { path: f.path, pinned: !f.pinned });
          toast(f.pinned ? 'Unpinned' : 'Pinned to top');
        } catch (err) {
          toast(`Could not update pin: ${err}`, 'error', 4500);
        }
        await refreshRecents();
      },
    },
    {
      label: 'Show in folder',
      run: () => {
        invoke('reveal_in_folder', { path: f.path }).catch((err) => {
          toast(`Could not open folder: ${err}`, 'error', 4500);
        });
      },
    },
    {
      label: 'Copy path',
      run: () => copyToClipboard(f.path),
    },
    {
      label: 'Remove from recents',
      run: () => removeRecentWithUndo(f),
    },
  ];
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'context-menu-item';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      item.run();
      closeAnyContextMenu();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  // Position: clamp inside the viewport.
  const r = menu.getBoundingClientRect();
  const maxLeft = window.innerWidth - r.width - 8;
  const maxTop = window.innerHeight - r.height - 8;
  menu.style.left = `${Math.min(x, maxLeft)}px`;
  menu.style.top = `${Math.min(y, maxTop)}px`;
  // Focus the first menu item so Enter activates the primary action.
  setTimeout(() => menu.querySelector<HTMLButtonElement>('.context-menu-item')?.focus(), 0);

  const dismiss = (e?: Event) => {
    if (e && menu.contains(e.target as Node)) return;
    closeAnyContextMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAnyContextMenu();
      return;
    }
    // Up/Down (and Home/End) move focus between items, per the role="menu"
    // pattern; otherwise the declared role implies keyboard nav it doesn't have.
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('.context-menu-item'));
    if (items.length === 0) return;
    e.preventDefault();
    const cur = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'ArrowDown') next = cur < 0 ? 0 : (cur + 1) % items.length;
    else next = cur < 0 ? items.length - 1 : (cur - 1 + items.length) % items.length;
    items[next].focus();
  };
  // Escape can attach immediately — the opening event is a mouse event, not a
  // keydown, so there's no self-close race. Only the mousedown `dismiss` must
  // be deferred one frame so the contextmenu/mousedown that opened us doesn't
  // instantly close it.
  window.addEventListener('keydown', onKey);
  setTimeout(() => {
    window.addEventListener('mousedown', dismiss);
  }, 0);
  // Stash cleanup on the element so closeAnyContextMenu can run it.
  (menu as HTMLElement & { __cleanup?: () => void }).__cleanup = () => {
    window.removeEventListener('mousedown', dismiss);
    window.removeEventListener('keydown', onKey);
    menu.remove();
  };
}

function closeAnyContextMenu() {
  for (const el of document.querySelectorAll<HTMLElement>('.context-menu')) {
    (el as HTMLElement & { __cleanup?: () => void }).__cleanup?.();
  }
}

/**
 * Remove a recent entry, but offer a ~6s undo via an action toast. The
 * removed entry is cached so undo can re-add it (restoring its pin state
 * with the existing add + set-pinned commands).
 */
async function removeRecentWithUndo(f: RecentFile) {
  try {
    await invoke('remove_recent_file', { path: f.path });
  } catch (err) {
    console.error('remove_recent_file failed', err);
    toast(`Couldn’t remove “${basename(f.path)}”.`, 'error', 4000);
    return;
  }
  await refreshRecents();
  actionToast(
    `Removed “${basename(f.path)}”.`,
    'Undo',
    async () => {
      try {
        await invoke('add_recent_file', { path: f.path });
        if (f.pinned) {
          await invoke('set_recent_pinned', { path: f.path, pinned: true }).catch(() => undefined);
        }
      } catch (err) {
        console.error('undo remove failed', err);
        toast(`Couldn’t restore “${basename(f.path)}”.`, 'error', 4000);
      }
      await refreshRecents();
    },
    'default',
    6000,
  );
}

/**
 * Open a recent file with a pre-flight existence check. If the path no
 * longer exists (user moved or deleted it since it was last opened),
 * show an actionable error toast instead of opening an editor that
 * silently fails to render.
 */
async function openRecent(f: RecentFile) {
  // Debounce rapid double/triple-clicks on the same card so we don't queue
  // multiple open commands (and multiple windows). The path is locked for
  // 500ms after the first click; subsequent clicks within that window are
  // ignored.
  if (recentClickLock.has(f.path)) return;
  recentClickLock.add(f.path);
  setTimeout(() => recentClickLock.delete(f.path), 500);

  let exists = true;
  try {
    exists = await invoke<boolean>('file_exists', { path: f.path });
  } catch {
    /* if the check itself fails, fall through and let the editor decide */
  }
  if (!exists) {
    toast(`Couldn't find ${basename(f.path)} — removed from recents.`, 'error', 4500);
    try {
      await invoke('remove_recent_file', { path: f.path });
    } catch {
      /* best-effort */
    }
    await refreshRecents();
    return;
  }
  openOrReplaceLauncher(f.kind, f.path);
}

function bindHomePanel() {
  $('open-file').addEventListener('click', async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'All supported',
          extensions: ['docx', 'txt', 'md', 'markdown', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv', 'tab'],
        },
        { name: 'Word document', extensions: ['docx'] },
        { name: 'Text', extensions: ['txt', 'md', 'markdown'] },
        { name: 'Spreadsheet', extensions: ['xlsx', 'xlsm', 'ods'] },
        { name: 'Delimited', extensions: ['csv', 'tsv', 'tab'] },
      ],
    });
    if (!selected || typeof selected !== 'string') return;
    const kind = kindFromPath(selected);
    if (!kind) {
      toast(`Unsupported file: ${basename(selected)}`, 'error', 4000);
      return;
    }
    openOrReplaceLauncher(kind, selected);
  });

  $('new-docx').addEventListener('click', () => openOrReplaceLauncher('docx', null));
  $('new-sheets').addEventListener('click', () => openOrReplaceLauncher('sheets', null));

  $('clear-recents').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear all recent files?',
      body: 'This removes every entry from your recent files list, including pinned ones. The files themselves are not deleted. This can’t be undone.',
      confirmLabel: 'Clear all',
      cancelLabel: 'Keep them',
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke('clear_recent_files');
      await refreshRecents();
      toast('Recent files cleared');
    } catch (err) {
      console.error('clear_recent_files failed', err);
      toast('Couldn’t clear recent files.', 'error', 4000);
    }
  });

  // Retry button in the recents error state.
  $('recent-retry').addEventListener('click', () => {
    refreshRecents();
  });

  // Filter recent files as the user types — pure client-side over the
  // cached list, no Rust round-trips.
  const search = $<HTMLInputElement>('recent-search');
  search.addEventListener('input', () => {
    recentSearchQuery = search.value;
    renderRecents();
  });

  // Type-filter buttons (All / Documents / Spreadsheets). These are
  // role="tab" in a role="tablist": keep aria-selected in sync, use a roving
  // tabindex (only the active tab is Tab-reachable), and support the WAI-ARIA
  // arrow-key navigation the roles imply.
  const filterBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.filter-btn'));
  const activateFilter = (btn: HTMLButtonElement) => {
    for (const other of filterBtns) {
      other.classList.remove('active');
      other.setAttribute('aria-selected', 'false');
      other.tabIndex = -1;
    }
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.tabIndex = 0;
    recentTypeFilter = (btn.dataset.filter as typeof recentTypeFilter) ?? 'all';
    renderRecents();
  };
  filterBtns.forEach((btn, i) => {
    btn.tabIndex = btn.classList.contains('active') ? 0 : -1;
    btn.addEventListener('click', () => activateFilter(btn));
    btn.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % filterBtns.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        next = (i - 1 + filterBtns.length) % filterBtns.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = filterBtns.length - 1;
      else return;
      e.preventDefault();
      const target = filterBtns[next];
      activateFilter(target);
      target.focus();
    });
  });

  // When the launcher regains focus, bring it up to date with what happened in
  // the document windows while it was in the background:
  //  - re-read the clock so a window left open across a time boundary updates
  //    its greeting instead of going stale until a reload (UX-AUDIT §2);
  //  - re-pull recents so a file just saved / opened in a doc window (which
  //    calls add_recent_file out-of-process) shows up + reorders without a
  //    manual refresh (UX-AUDIT §5).
  const onLauncherFocus = () => {
    if ($('workspace').hidden) return;
    renderGreeting();
    void refreshRecents();
  };
  window.addEventListener('focus', onLauncherFocus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onLauncherFocus();
  });

  // Recent cards: arrow keys add a fast path to move focus between cards. The
  // grid previously relied on Tab cycling through every card + its ⋯ button
  // (UX-AUDIT §2). Additive — Tab order is unchanged; Up/Down/Left/Right + Home
  // /End simply hop card-to-card. Delegated on the container so it survives the
  // frequent renderRecents() re-renders. Ignored when focus is on the ⋯ button
  // (a sibling of the card, not a descendant) so its own behaviour is untouched.
  const groupsEl = $('recent-groups');
  groupsEl.addEventListener('keydown', (e) => {
    const card = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.recent-card');
    if (!card) return;
    const nav = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!nav.includes(e.key)) return;
    const cards = Array.from(groupsEl.querySelectorAll<HTMLButtonElement>('.recent-card'));
    const cur = cards.indexOf(card);
    if (cur < 0) return;
    let next = cur;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (cur + 1) % cards.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (cur - 1 + cards.length) % cards.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = cards.length - 1;
    e.preventDefault();
    cards[next]?.focus();
  });
}

// =============================================================================
// Drag-and-drop: open files dropped on the window
// =============================================================================

async function bindDragDrop() {
  // The WebKitGTK Tauri runtime can fire a spurious 'enter' at startup
  // with an empty paths array. We filter that out: only show the overlay
  // when at least one supported file is actually being dragged.
  let dragActive = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const overlay = $('drop-overlay');
  const title = $('drop-title');
  const sub = $('drop-sub');

  // Long safety-net timeout: the overlay is normally dismissed by an
  // actual 'leave' or 'drop' event. The timer is only a last resort for
  // WMs that swallow those events entirely. A short (4s) timer caused
  // visible flicker when the user held a drag over the window without
  // moving, so it's been pushed out to 30s and is reset on every 'over'
  // — long enough that a real, ongoing drag never trips it.
  const SAFETY_HIDE_MS = 30_000;
  const armSafetyTimer = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideOverlay, SAFETY_HIDE_MS);
  };

  const showOverlay = (supported: string[]) => {
    if (dragActive) return;
    dragActive = true;
    overlay.hidden = false;
    const n = supported.length;
    title.textContent = n === 1 ? 'Drop to open' : `Drop to open ${n} files`;
    sub.textContent = supported
      .slice(0, 3)
      .map((p) => p.split(/[\\/]/).pop())
      .join(' · ');
    armSafetyTimer();
  };
  const hideOverlay = () => {
    dragActive = false;
    overlay.hidden = true;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  // Test hook (dev builds only): Tauri's drag-drop event bus isn't available in
  // the Playwright harness, so expose the handler to drive it synthetically.
  if (import.meta.env.DEV) {
    (window as unknown as { __deskApp_handleDrop?: (paths: string[]) => void }).__deskApp_handleDrop =
      handleDrop;
  }

  try {
    await getCurrentWindow().onDragDropEvent(({ payload }) => {
      const t = (payload as { type?: string }).type;
      const paths = (payload as { paths?: string[] }).paths ?? [];
      // Don't accept anything while the first-run wizard is up.
      if (!$('wizard').hidden) return;

      if (t === 'enter') {
        const supported = paths.filter((p) => kindFromPath(p));
        if (supported.length > 0) showOverlay(supported);
      } else if (t === 'over') {
        // Keep the overlay alive while we're being hovered — push the
        // safety timer back out so an ongoing drag never trips it.
        if (dragActive) armSafetyTimer();
      } else if (t === 'leave') {
        hideOverlay();
      } else if (t === 'drop') {
        hideOverlay();
        handleDrop(paths);
      }
    });
  } catch (err) {
    console.warn('drag-drop binding failed (non-Tauri context?)', err);
  }
}

// =============================================================================
// Keyboard shortcuts (global; editors handle Ctrl+S inside iframes themselves)
// =============================================================================

function bindShortcuts() {
  window.addEventListener('keydown', (e) => {
    const meta = e.ctrlKey || e.metaKey;
    if (!meta) return;
    const key = e.key.toLowerCase();
    // Ctrl/Cmd-O — Open file dialog
    if (key === 'o' && !e.shiftKey) {
      e.preventDefault();
      $('open-file').click();
    }
    // Ctrl/Cmd-N — New document (.docx)
    if (key === 'n' && !e.shiftKey) {
      e.preventDefault();
      $('new-docx').click();
    }
    // Ctrl/Cmd-Shift-N — New spreadsheet (.xlsx)
    if (key === 'n' && e.shiftKey) {
      e.preventDefault();
      $('new-sheets').click();
    }
    // Ctrl/Cmd-, — Settings (industry standard)
    if (key === ',') {
      e.preventDefault();
      if ($('settings-panel').hidden) showSettings();
      else hideSettings();
    }
  });
}

// =============================================================================
// Wizard
// =============================================================================

type WizardState = {
  step: 1 | 2 | 3;
  name: string;
  email: string;
  timezone: string;
  theme: Settings['theme'];
  dir: string | null;
};

const wiz: WizardState = {
  step: 1,
  name: '',
  email: '',
  timezone: detectTimezone(),
  theme: 'system',
  dir: null,
};

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Loose, non-blocking email check — just enough to catch obviously
 *  malformed values ("foo", "a@b", "x@y."). Empty is valid (email is
 *  optional). Not RFC-5322 strict on purpose. */
function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** True if `tz` is in the known timezone list (the datalist source).
 *  Empty is allowed (means "use system tz"). Used to reject typed
 *  nonsense before persisting. */
function isKnownTimezone(tz: string): boolean {
  const v = tz.trim();
  if (v === '') return true;
  return supportedTimezones().includes(v);
}

/**
 * Best-effort check that a chosen default-save folder exists and is a
 * directory; shows a warning toast if not, so a later Save As into it
 * doesn't fail mysteriously. Non-blocking — settings still save. Uses the
 * fs plugin's `stat`; any error (plugin unavailable, path out of the
 * capability scope) is swallowed so the check never breaks the save.
 */
async function warnIfFolderUnusable(dir: string) {
  try {
    const { stat } = await import('@tauri-apps/plugin-fs');
    const info = await stat(dir);
    if (!info.isDirectory) {
      toast('That default save folder isn’t a folder — saves there may fail.', 'error', 5000);
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    // A "not found" error is actionable; permission/scope errors are not,
    // so only warn when the path genuinely doesn't resolve.
    if (/not found|no such file|enoent/i.test(raw)) {
      toast('That default save folder doesn’t exist — saves there may fail.', 'error', 5000);
    } else {
      console.warn('default-folder check skipped', err);
    }
  }
}

/** Show/hide an inline `.field-error` element by id with a message. */
function setFieldError(errorElId: string, message: string | null) {
  const el = document.getElementById(errorElId);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

/** sessionStorage key for the in-progress wizard draft, so a mid-flow
 *  window close doesn't lose typed input. Cleared once setup completes. */
const WIZARD_DRAFT_KEY = 'casualoffice.wizard.draft';

function saveWizardDraft() {
  try {
    sessionStorage.setItem(
      WIZARD_DRAFT_KEY,
      JSON.stringify({ name: wiz.name, email: wiz.email, timezone: wiz.timezone }),
    );
  } catch {
    /* sessionStorage may be unavailable; non-fatal */
  }
}

function clearWizardDraft() {
  try {
    sessionStorage.removeItem(WIZARD_DRAFT_KEY);
  } catch {
    /* non-fatal */
  }
}

function loadWizardDraft(): { name: string; email: string; timezone: string } | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { name?: string; email?: string; timezone?: string };
    return { name: d.name ?? '', email: d.email ?? '', timezone: d.timezone ?? '' };
  } catch {
    return null;
  }
}

/** Full IANA time zone list when the runtime supports it, falling back
 *  to a hand-picked common subset on older browsers. */
function supportedTimezones(): string[] {
  try {
    // Modern engines (WebKitGTK 2.40+, Chromium 99+, Firefox 93+).
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === 'function') {
      return intl.supportedValuesOf('timeZone');
    }
  } catch {
    /* fall through */
  }
  return [
    'UTC',
    'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
    'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'Africa/Cairo', 'Africa/Johannesburg',
    'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Bangkok',
    'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
    'Australia/Sydney', 'Pacific/Auckland',
  ];
}

function populateTimezoneDatalist() {
  const list = document.getElementById('tz-list');
  if (!list) return;
  // Built once on boot; the option set is fixed for the runtime.
  if (list.children.length > 0) return;
  for (const tz of supportedTimezones()) {
    const opt = document.createElement('option');
    opt.value = tz;
    list.appendChild(opt);
  }
}

function showWizardStep(n: 1 | 2 | 3) {
  wiz.step = n;
  for (const s of document.querySelectorAll<HTMLElement>('.wiz-step')) {
    s.hidden = Number(s.dataset.step) !== n;
  }
  const prog = document.querySelector<HTMLElement>('.wiz-progress');
  if (prog) prog.dataset.step = String(n);
}

function bindWizard() {
  const nameInput = $<HTMLInputElement>('wiz-name');
  const emailInput = $<HTMLInputElement>('wiz-email');
  const tzInput = $<HTMLInputElement>('wiz-tz');
  const next1 = $<HTMLButtonElement>('wiz-next-1');
  // Restore any draft saved before a mid-flow window close, falling back
  // to the detected timezone.
  const draft = loadWizardDraft();
  if (draft) {
    wiz.name = draft.name;
    wiz.email = draft.email;
    if (draft.timezone) wiz.timezone = draft.timezone;
  }
  nameInput.value = wiz.name;
  emailInput.value = wiz.email;
  // Prefill timezone with the (draft or system) value; user can edit.
  tzInput.value = wiz.timezone;
  next1.disabled = wiz.name.trim().length === 0;
  nameInput.addEventListener('input', () => {
    wiz.name = nameInput.value;
    next1.disabled = wiz.name.trim().length === 0;
    saveWizardDraft();
  });
  emailInput.addEventListener('input', () => {
    wiz.email = emailInput.value;
    // Clear any stale error as the user edits; re-validate on blur.
    setFieldError('wiz-email-error', null);
    saveWizardDraft();
  });
  emailInput.addEventListener('blur', () => {
    setFieldError(
      'wiz-email-error',
      isPlausibleEmail(emailInput.value) ? null : 'That doesn’t look like an email address.',
    );
  });
  tzInput.addEventListener('input', () => {
    wiz.timezone = tzInput.value;
    setFieldError('wiz-tz-error', null);
    saveWizardDraft();
  });
  tzInput.addEventListener('blur', () => {
    setFieldError(
      'wiz-tz-error',
      isKnownTimezone(tzInput.value) ? null : 'Unknown time zone — your system time zone will be used.',
    );
  });
  next1.addEventListener('click', () => showWizardStep(2));
  $('wiz-skip').addEventListener('click', skipWizard);

  $('wiz-back-2').addEventListener('click', () => showWizardStep(1));
  $('wiz-next-2').addEventListener('click', () => {
    const selected = document.querySelector<HTMLInputElement>('input[name=theme]:checked');
    wiz.theme = (selected?.value as Settings['theme']) ?? 'system';
    applyTheme(wiz.theme);
    showWizardStep(3);
  });

  $('wiz-back-3').addEventListener('click', () => showWizardStep(2));
  $('wiz-pick-dir').addEventListener('click', async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') {
      wiz.dir = picked;
      $<HTMLInputElement>('wiz-dir').value = picked;
    }
  });
  $('wiz-clear-dir').addEventListener('click', () => {
    wiz.dir = null;
    $<HTMLInputElement>('wiz-dir').value = '';
  });
  $('wiz-finish').addEventListener('click', finishWizard);
}

async function finishWizard() {
  const finishBtn = $<HTMLButtonElement>('wiz-finish');
  finishBtn.disabled = true;
  finishBtn.textContent = 'Saving…';
  try {
    const name = wiz.name.trim() || 'You';
    // Email is optional, but never persist an obviously malformed value.
    // Timezone is validated against the known list; nonsense falls back to
    // the detected/empty value so we don't store garbage.
    const email = isPlausibleEmail(wiz.email) ? wiz.email.trim() || null : null;
    const tz = isKnownTimezone(wiz.timezone) ? wiz.timezone.trim() || null : detectTimezone() || null;
    if (!isPlausibleEmail(wiz.email)) {
      toast('That email looked malformed, so it wasn’t saved.', 'error', 4000);
    }
    const profile: Profile = {
      name,
      avatar_hue: hashHue(name.toLowerCase()),
      timezone: tz,
      email,
      avatar_path: null,
      created_at: 0,
    };
    // Preserve any other persisted prefs (privacy_mode, warn_on_unsaved_close,
    // open_window_preference, last_seen_version) — save_settings writes the
    // object verbatim, so a partial object would let serde defaults wipe them.
    const settings: Settings = {
      ...state.settings,
      theme: wiz.theme,
      default_save_dir: wiz.dir,
    };
    const saved = await Promise.race([
      invoke<Profile>('save_profile', { profile }),
      new Promise<Profile>((_, reject) =>
        setTimeout(() => reject(new Error('Save profile timed out (5s)')), 5000),
      ),
    ]);
    state.profile = saved;
    const savedSettings = await Promise.race([
      invoke<Settings>('save_settings', { settings }),
      new Promise<Settings>((_, reject) =>
        setTimeout(() => reject(new Error('Save settings timed out (5s)')), 5000),
      ),
    ]);
    state.settings = savedSettings;
    applyTheme(state.settings.theme);
    broadcastTheme(state.settings.theme);
    clearWizardDraft();
    revealWorkspace();
  } catch (err) {
    console.error('finishWizard failed', err);
    // Show error inline on the wizard so the user sees what went wrong
    // (alert() can be eaten by some Linux webviews).
    let errorEl = document.getElementById('wiz-error');
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.id = 'wiz-error';
      errorEl.className = 'settings-error';
      finishBtn.parentElement?.insertBefore(errorEl, finishBtn);
    }
    errorEl.textContent = `Could not save: ${err instanceof Error ? err.message : err}`;
    finishBtn.disabled = false;
    finishBtn.textContent = 'Finish setup';
  }
}

/**
 * Complete setup with sensible defaults so a user is never trapped on the
 * wizard. Name is optional → "You"; timezone falls back to detected;
 * theme stays "system"; default folder stays unset. Persists a minimal
 * profile + settings, then reveals the home screen — same persistence the
 * full finish does, so the wizard doesn't re-appear next boot.
 */
async function skipWizard() {
  const skipBtn = $<HTMLButtonElement>('wiz-skip');
  skipBtn.disabled = true;
  // Honor anything the user already typed on step 1, but only if it's valid.
  const name = wiz.name.trim() || 'You';
  const email = isPlausibleEmail(wiz.email) ? wiz.email.trim() || null : null;
  const tz = (isKnownTimezone(wiz.timezone) ? wiz.timezone.trim() : '') || detectTimezone() || null;
  const profile: Profile = {
    name,
    avatar_hue: hashHue(name.toLowerCase()),
    timezone: tz,
    email,
    avatar_path: null,
    created_at: 0,
  };
  // Skipping resets theme/folder to defaults but must keep other persisted
  // prefs (privacy_mode, warn_on_unsaved_close, open_window_preference) — the
  // saved object is written verbatim, so spread the current settings first.
  const settings: Settings = { ...state.settings, theme: 'system', default_save_dir: null };
  try {
    state.profile = await invoke<Profile>('save_profile', { profile });
    state.settings = await invoke<Settings>('save_settings', { settings });
    applyTheme(state.settings.theme);
    broadcastTheme(state.settings.theme);
    clearWizardDraft();
    revealWorkspace();
  } catch (err) {
    console.error('skipWizard failed', err);
    toast(`Could not complete setup: ${err instanceof Error ? err.message : err}`, 'error', 4500);
    skipBtn.disabled = false;
  }
}

// =============================================================================
// Workspace boot
// =============================================================================

/** Set the hero greeting from the current clock. Pulled out of revealWorkspace
 *  so it can be re-run when the launcher regains focus — otherwise a window
 *  left open across a time boundary (e.g. morning → evening) keeps stale text
 *  until a reload (UX-AUDIT §2). No-op until the profile is loaded. */
function renderGreeting() {
  if (!state.profile) return;
  const greet = $('greeting');
  const hr = new Date().getHours();
  const partOfDay =
    hr < 5 ? 'Working late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  greet.textContent = `${partOfDay}, ${state.profile.name.split(/\s+/)[0]}`;
}

function revealWorkspace() {
  $('wizard').hidden = true;
  $('workspace').hidden = false;
  if (state.profile) {
    renderAvatar($<HTMLSpanElement>('user-avatar'), state.profile);
    const chipName = document.getElementById('user-chip-name');
    if (chipName) chipName.textContent = state.profile.name.split(/\s+/)[0];
    renderGreeting();
  }
  refreshRecents();
  maybeShowWhatsNew();
}

// ---------- "What's new" modal --------------------------------------------

async function maybeShowWhatsNew() {
  let appVersion: string;
  try {
    appVersion = await invoke<string>('get_app_version');
  } catch {
    return;
  }
  // First-run wizard already covered "welcome" — only show this when the
  // user moves to a NEW version from a SEEN one. Wizard sets
  // last_seen_version on completion (below) so a fresh install doesn't
  // double-greet.
  const lastSeen = state.settings.last_seen_version ?? null;
  if (lastSeen === appVersion) return;
  if (lastSeen === null) {
    // First-ever launch (wizard already ran): just stamp the version and
    // skip — no changelog to compare against.
    await markVersionSeen(appVersion);
    return;
  }

  // Only show a changelog block that matches this exact version. The previous
  // `?? CHANGELOG[0]` fallback surfaced another version's entry mislabeled as
  // the current one (e.g. the 0.0.0 "Welcome" block shown as 0.0.1) on any
  // version without its own block. When there's no matching entry, record the
  // version as seen and skip until a real entry is added for it.
  const entry = CHANGELOG.find((c) => c.version === appVersion);
  if (!entry) {
    await markVersionSeen(appVersion);
    return;
  }
  showWhatsNew(entry, appVersion);
}

function showWhatsNew(
  entry: (typeof CHANGELOG)[number],
  appVersion: string,
) {
  const modal = $('whats-new');
  $('whats-new-title').textContent = entry.title;
  $('whats-new-version').textContent = `Casual Office ${appVersion}`;
  const list = $<HTMLUListElement>('whats-new-list');
  list.innerHTML = '';
  for (const h of entry.highlights) {
    const li = document.createElement('li');
    li.textContent = h;
    list.appendChild(li);
  }
  const previouslyFocused = document.activeElement as HTMLElement | null;
  modal.hidden = false;
  setTimeout(() => $<HTMLButtonElement>('whats-new-dismiss').focus(), 0);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      dismiss();
    } else {
      trapTabKey(e, modal);
    }
  };
  // Click on the backdrop (outside the modal box) dismisses.
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === modal) dismiss();
  };
  const dismissBtn = $<HTMLButtonElement>('whats-new-dismiss');
  const dismiss = async () => {
    modal.hidden = true;
    window.removeEventListener('keydown', onKey);
    modal.removeEventListener('mousedown', onBackdrop);
    dismissBtn.removeEventListener('click', dismiss);
    previouslyFocused?.focus?.();
    await markVersionSeen(appVersion);
  };
  dismissBtn.addEventListener('click', dismiss);
  modal.addEventListener('mousedown', onBackdrop);
  window.addEventListener('keydown', onKey);
}

async function markVersionSeen(version: string) {
  const next: Settings = { ...state.settings, last_seen_version: version };
  state.settings = next;
  try {
    await invoke('save_settings', { settings: next });
  } catch {
    /* best-effort */
  }
}

const avatarDataUrlCache = new Map<string, string>();

async function renderAvatar(el: HTMLElement, profile: Profile) {
  el.style.backgroundImage = '';
  el.textContent = '';
  if (profile.avatar_path) {
    try {
      let dataUrl = avatarDataUrlCache.get(profile.avatar_path);
      if (!dataUrl) {
        const bytes = await invoke<number[]>('read_avatar_bytes', { path: profile.avatar_path });
        const ext = profile.avatar_path.split('.').pop()?.toLowerCase() ?? 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
          : 'image/png';
        // btoa needs a binary string; chunk to avoid call-stack overflow.
        let bin = '';
        const arr = Uint8Array.from(bytes);
        for (let i = 0; i < arr.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + 0x8000)));
        }
        dataUrl = `data:${mime};base64,${btoa(bin)}`;
        avatarDataUrlCache.set(profile.avatar_path, dataUrl);
      }
      el.style.backgroundImage = `url("${dataUrl}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundColor = 'transparent';
      return;
    } catch (err) {
      console.warn('avatar read failed', err);
    }
  }
  el.textContent = initials(profile.name);
  el.style.backgroundColor = `hsl(${profile.avatar_hue}, 55%, 50%)`;
}

// ---------- Settings panel -------------------------------------------------

function showSettings() {
  $('home-panel').hidden = true;
  $('settings-panel').hidden = false;
  $('user-chip').setAttribute('aria-pressed', 'true');
  populateSettings();
  // Escape returns to home.
  window.addEventListener('keydown', settingsEscape);
}

function hideSettings() {
  $('settings-panel').hidden = true;
  $('home-panel').hidden = false;
  $('user-chip').setAttribute('aria-pressed', 'false');
  $('settings-error').textContent = '';
  // Revert any unsaved live theme preview to the stored theme. After a
  // successful Save, state.settings.theme already holds the new value so this
  // is a harmless re-apply; after a cancel/Escape it undoes the preview.
  applyTheme(state.settings.theme);
  window.removeEventListener('keydown', settingsEscape);
}

function settingsEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && !$('settings-panel').hidden) {
    e.preventDefault();
    hideSettings();
  }
}

function populateSettings() {
  if (!state.profile) return;
  setFieldError('settings-email-error', null);
  setFieldError('settings-tz-error', null);
  renderAvatar($('settings-avatar'), state.profile);
  $<HTMLInputElement>('settings-name').value = state.profile.name;
  $<HTMLInputElement>('settings-email').value = state.profile.email ?? '';
  $<HTMLInputElement>('settings-tz').value = state.profile.timezone ?? detectTimezone();
  $<HTMLInputElement>('settings-dir').value = state.settings.default_save_dir ?? '';
  const privacyEl = $<HTMLInputElement>('settings-privacy');
  privacyEl.checked = state.settings.privacy_mode === true;
  // Disable where the underlying content-protection call is a no-op (Linux), so
  // the control's enabled state reflects whether it actually does anything.
  privacyEl.disabled = isLinuxDesktop();
  // Behavior: open-where preference (defaults to "ask") and the unsaved-close
  // warning (defaults to true when absent).
  const openPref = state.settings.open_window_preference ?? 'ask';
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=settings-open-pref]')) {
    radio.checked = radio.value === openPref;
  }
  $<HTMLInputElement>('settings-warn-close').checked = state.settings.warn_on_unsaved_close !== false;
  $<HTMLInputElement>('settings-auto-update').checked = state.settings.auto_update !== false;
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=settings-theme]')) {
    radio.checked = radio.value === state.settings.theme;
  }
  syncThemeCardAria();
  // App version in About — cheap call, but only on settings-open to keep
  // boot light.
  invoke<string>('get_app_version')
    .then((v) => {
      const el = document.getElementById('settings-version');
      if (el) el.textContent = `v${v}`;
    })
    .catch(() => undefined);
}

function bindSettings() {
  $('user-chip').addEventListener('click', showSettings);
  $('settings-close').addEventListener('click', hideSettings);

  // Live theme preview: selecting a theme in Settings applies it to the
  // launcher immediately (matching the first-run wizard), so the choice is
  // visible before Save. Save persists + broadcasts to open editor windows;
  // closing without saving reverts to the stored theme (see hideSettings).
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=settings-theme]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      applyTheme(radio.value as Settings['theme']);
      syncThemeCardAria();
    });
  }

  // Inline, non-blocking validation on blur for the optional email and the
  // timezone field (mirrors the wizard).
  const settingsEmail = $<HTMLInputElement>('settings-email');
  settingsEmail.addEventListener('input', () => setFieldError('settings-email-error', null));
  settingsEmail.addEventListener('blur', () => {
    setFieldError(
      'settings-email-error',
      isPlausibleEmail(settingsEmail.value) ? null : 'That doesn’t look like an email address.',
    );
  });
  const settingsTz = $<HTMLInputElement>('settings-tz');
  settingsTz.addEventListener('input', () => setFieldError('settings-tz-error', null));
  settingsTz.addEventListener('blur', () => {
    setFieldError(
      'settings-tz-error',
      isKnownTimezone(settingsTz.value) ? null : 'Unknown time zone — your previous setting will be kept.',
    );
  });

  $('settings-pick-avatar').addEventListener('click', async () => {
    try {
      const newPath = await invoke<string | null>('pick_avatar_image');
      if (!newPath || !state.profile) return;
      const next: Profile = { ...state.profile, avatar_path: newPath };
      state.profile = await invoke<Profile>('save_profile', { profile: next });
      avatarDataUrlCache.delete(newPath);
      await renderAvatar($('settings-avatar'), state.profile);
      await renderAvatar($('user-avatar'), state.profile);
      toast('Profile picture updated', 'success');
    } catch (err) {
      $('settings-error').textContent = `Could not set picture: ${err}`;
    }
  });

  $('settings-remove-avatar').addEventListener('click', async () => {
    if (!state.profile?.avatar_path) return;
    const next: Profile = { ...state.profile, avatar_path: null };
    try {
      state.profile = await invoke<Profile>('save_profile', { profile: next });
      await renderAvatar($('settings-avatar'), state.profile);
      await renderAvatar($('user-avatar'), state.profile);
      toast('Profile picture removed', 'success');
    } catch (err) {
      $('settings-error').textContent = `Could not remove picture: ${err}`;
    }
  });

  $('settings-pick-dir').addEventListener('click', async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') $<HTMLInputElement>('settings-dir').value = picked;
  });
  $('settings-clear-dir').addEventListener('click', () => {
    $<HTMLInputElement>('settings-dir').value = '';
  });

  $('settings-rerun-wizard').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Re-run the setup wizard?',
      body:
        'This walks you back through the welcome steps with your current details prefilled. ' +
        'Nothing is cleared until you finish — your recent files and theme are kept, and your ' +
        'existing profile stays as-is if you back out.',
      confirmLabel: 'Run setup',
      cancelLabel: 'Stay here',
    });
    if (!ok) return;
    // Re-show the first-run wizard WITHOUT wiping the stored profile — the
    // wizard's finish/skip handlers overwrite the profile on completion, so
    // closing the window mid-flow leaves the original profile intact. We
    // prefill from the live profile so the user tweaks rather than retypes.
    hideSettings();
    $('workspace').hidden = true;
    $('wizard').hidden = false;
    showWizardStep(1);
    const p = state.profile;
    wiz.name = p && p.name !== 'You' ? p.name : '';
    wiz.email = p?.email ?? '';
    wiz.timezone = p?.timezone ?? detectTimezone();
    wiz.theme = state.settings.theme;
    wiz.dir = state.settings.default_save_dir ?? null;
    // Drop any stale half-finished draft so it doesn't clobber the prefill.
    clearWizardDraft();
    $<HTMLInputElement>('wiz-name').value = wiz.name;
    $<HTMLInputElement>('wiz-email').value = wiz.email;
    $<HTMLInputElement>('wiz-tz').value = wiz.timezone;
    // Re-sync the theme + default-dir controls the later steps read from.
    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=theme]')) {
      radio.checked = radio.value === wiz.theme;
    }
    syncThemeCardAria();
    $<HTMLInputElement>('wiz-dir').value = wiz.dir ?? '';
    // Enable/disable step-1 Next to match the prefilled name.
    $<HTMLButtonElement>('wiz-next-1').disabled = wiz.name.trim().length === 0;
    $<HTMLInputElement>('wiz-name').focus();
  });

  $('settings-save').addEventListener('click', async () => {
    if (!state.profile) return;
    $('settings-error').textContent = '';
    const name = $<HTMLInputElement>('settings-name').value.trim();
    if (!name) {
      $('settings-error').textContent = 'Name is required.';
      return;
    }
    const themeRadio = document.querySelector<HTMLInputElement>('input[name=settings-theme]:checked');
    const theme = (themeRadio?.value as Settings['theme']) ?? 'system';
    const dir = $<HTMLInputElement>('settings-dir').value.trim() || null;
    // Email is optional but never persisted malformed — surface it inline
    // and drop the bad value rather than saving nonsense silently.
    const rawEmail = $<HTMLInputElement>('settings-email').value;
    let email: string | null;
    if (isPlausibleEmail(rawEmail)) {
      setFieldError('settings-email-error', null);
      email = rawEmail.trim() || null;
    } else {
      setFieldError('settings-email-error', 'That doesn’t look like an email address — not saved.');
      email = state.profile.email; // keep the previously-stored value
    }
    // Timezone: validate against the known list; fall back to the existing
    // stored value (or empty) rather than persisting something unknown.
    const rawTz = $<HTMLInputElement>('settings-tz').value;
    let timezone: string | null;
    if (isKnownTimezone(rawTz)) {
      setFieldError('settings-tz-error', null);
      timezone = rawTz.trim() || null;
    } else {
      setFieldError('settings-tz-error', 'Unknown time zone — keeping your previous setting.');
      timezone = state.profile.timezone;
    }
    const updatedProfile: Profile = {
      ...state.profile,
      name,
      email,
      timezone,
    };
    // Best-effort sanity check on the default save folder so a later Save As
    // doesn't fail mysteriously: warn if the chosen directory doesn't exist
    // (or isn't a directory). This is non-blocking — the save still goes
    // through — and degrades gracefully if the fs check is unavailable.
    if (dir) {
      await warnIfFolderUnusable(dir);
    }
    const openPrefRadio = document.querySelector<HTMLInputElement>(
      'input[name=settings-open-pref]:checked',
    );
    const openPref = (openPrefRadio?.value as Settings['open_window_preference']) ?? 'ask';
    const updatedSettings: Settings = {
      ...state.settings,
      theme,
      default_save_dir: dir,
      privacy_mode: $<HTMLInputElement>('settings-privacy').checked,
      open_window_preference: openPref,
      warn_on_unsaved_close: $<HTMLInputElement>('settings-warn-close').checked,
      auto_update: $<HTMLInputElement>('settings-auto-update').checked,
    };
    const saveBtn = $<HTMLButtonElement>('settings-save');
    const originalLabel = saveBtn.textContent ?? 'Save changes';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      state.profile = await invoke<Profile>('save_profile', { profile: updatedProfile });
      state.settings = await invoke<Settings>('save_settings', { settings: updatedSettings });
      applyTheme(state.settings.theme);
      broadcastTheme(state.settings.theme);
      // Apply privacy mode live to every open window (launcher + all
      // document windows), not just future ones. save_settings already
      // does a best-effort apply, but this explicit call lets us surface a
      // per-window failure instead of silently implying success. On
      // Linux/WebKitGTK there's no compositor API for this, so the toggle
      // is a stored preference only (the Settings copy says as much).
      await invoke('apply_privacy_mode', { enabled: updatedSettings.privacy_mode === true }).catch(
        (err) => {
          console.warn('apply_privacy_mode failed', err);
          toast('Privacy mode could not be applied to every open window.', 'error', 4500);
        },
      );
      await renderAvatar($('user-avatar'), state.profile);
      const chipName = document.getElementById('user-chip-name');
      if (chipName) chipName.textContent = state.profile.name.split(/\s+/)[0];
      hideSettings();
      toast('Settings saved', 'success');
    } catch (err) {
      $('settings-error').textContent = `Could not save: ${err}`;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function hideBootSkeleton() {
  const sk = document.getElementById('boot-skeleton');
  if (sk) sk.hidden = true;
}

async function boot() {
  populateTimezoneDatalist();
  bindWizard();
  bindHomePanel();
  bindSettings();
  bindShortcuts();
  // Keep theme-card aria-checked in sync whenever any theme radio changes.
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === 'radio' && t.closest('.theme-card')) {
      syncThemeCardAria();
    }
  });
  syncThemeCardAria();
  // Drag-drop binding is fire-and-forget; failures shouldn't block boot.
  bindDragDrop();

  // Clear this window's unsaved-changes flag on every launcher (home) load.
  // In same-window open mode the launcher window navigates into an editor that
  // marks it dirty; navigating back home reloads this bundle but the native
  // close-guard's dirty flag for "main" would otherwise persist, popping a
  // false "unsaved changes" prompt over a home screen with nothing to save.
  // Best-effort; a no-op outside the shell.
  void invoke('set_window_dirty', { dirty: false }).catch(() => undefined);

  // Each IPC call gets a short timeout fallback so a single broken Tauri
  // command can't strand the user on a blank screen.
  const firstRun = await withTimeout(invoke<boolean>('is_first_run'), 3000, true);
  if (firstRun) {
    const s = await withTimeout(
      invoke<Settings>('get_settings'),
      2000,
      { theme: 'system', default_save_dir: null } as Settings,
    );
    state.settings = s;
    applyTheme(s.theme);
    hideBootSkeleton();
    $('wizard').hidden = false;
    showWizardStep(1);
    $<HTMLInputElement>('wiz-name').focus();
    return;
  }

  const profile = await withTimeout(invoke<Profile | null>('get_profile'), 2000, null);
  const settings = await withTimeout(
    invoke<Settings>('get_settings'),
    2000,
    { theme: 'system', default_save_dir: null } as Settings,
  );
  state.profile = profile;
  state.settings = settings;
  applyTheme(settings.theme);
  hideBootSkeleton();
  if (profile) {
    revealWorkspace();
    void maybeOfferRecovery();
  } else {
    $('wizard').hidden = false;
    showWizardStep(1);
  }
  // Fire-and-forget after the UI is up — never gate boot on the network.
  void maybeCheckForUpdate();
}

/**
 * Check GitHub releases for a newer signed build and, if the user agrees,
 * download + install it and relaunch. Gated behind the `auto_update` setting
 * (default on). Entirely best-effort: before the first release is published
 * the endpoint 404s, and offline / network errors are swallowed — an update
 * check must never disrupt or block the launcher.
 */
async function maybeCheckForUpdate() {
  if (state.settings.auto_update === false) return;
  // Only meaningful inside the Tauri shell (the plugin isn't present on web).
  if (typeof window === 'undefined' || !('__TAURI__' in window)) return;
  try {
    const update = await check();
    if (!update) return;
    const ok = await confirmDialog({
      title: `Update available — ${update.version}`,
      body: `A newer version of Casual Office (${update.version}) is available.${
        update.body ? `\n\n${update.body}` : ''
      }\n\nInstall it now? The app will restart.`,
      confirmLabel: 'Install & restart',
      cancelLabel: 'Later',
    });
    if (!ok) return;
    setStatus('Downloading update…');
    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    // No release yet / offline / endpoint unreachable — stay silent.
    console.debug('[update] check failed', err);
  }
}

interface RecoveryEntry {
  path: string;
  recovery_path: string;
  saved_at: number;
}

/** On relaunch, surface any crash-recovery sidecars the editor left behind
 *  (orphaned = the app didn't exit cleanly). Offer to reopen the file and
 *  restore its unsaved changes; declining discards the sidecar. */
async function maybeOfferRecovery() {
  const pending = await withTimeout(
    invoke<RecoveryEntry[]>('pending_recoveries'),
    2000,
    [] as RecoveryEntry[],
  );
  for (const entry of pending) {
    const kind = kindFromPath(entry.path);
    if (!kind) continue;
    const name = entry.path.split(/[\\/]/).pop() || entry.path;
    const ok = await confirmDialog({
      title: 'Recover unsaved changes?',
      body: `“${name}” has unsaved changes from a session that didn't close normally. Reopen it to review and restore them?`,
      confirmLabel: 'Reopen',
      cancelLabel: 'Discard',
    });
    if (ok) {
      // Reopen the file. The editor finds the sidecar on load and surfaces its
      // own Restore banner (the actual restore decision — with a Discard option
      // — lives there), so this prompt is just "reopen?", not a second identical
      // "recover?". Remaining recoveries are offered again next launch.
      openOrReplaceLauncher(kind, entry.path);
      break;
    }
    void invoke('clear_recovery', { path: entry.path }).catch(() => undefined);
  }
}

boot().catch((err) => {
  console.error('boot failed', err);
  hideBootSkeleton();
  // Show the wizard even on catastrophic failure so the user has somewhere
  // to start; the wizard's save_profile call will surface the real error.
  $('wizard').hidden = false;
  showWizardStep(1);
  const status = document.getElementById('status');
  if (status) status.textContent = `Startup error: ${err}`;
});
