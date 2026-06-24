# Casual Office — Next Pipeline

The differentiators we commit to building next, all consistent with the
product thesis: **local-only, private, no account, no telemetry, offline-first.**
Nothing here introduces a mandatory cloud dependency.

Sequencing is by value-to-effort and dependency order. Effort: S ≤ ~2 days,
M ≈ ~1 week, L ≈ ~2–3 weeks, XL = multi-week initiative.

| # | Item | Effort | Thesis fit | Phase |
|---|------|--------|-----------|-------|
| 1 | Save-state indicator ("Saved / Modified") | S | Trust in the local save path | **Now** |
| 2 | Crash recovery / draft journal | M | Pure-local resilience | **Now** |
| 3 | PDF export (local, no service) | M | Most-requested missing primitive | **Next** |
| 4 | Accessibility leadership (WCAG/SR/keyboard/contrast) | M–L | Defensible niche | **Next** |
| 5 | End-to-end-encrypted optional sync | XL | Answers multi-machine without becoming cloud | **Later** |

---

## 1 — Save-state indicator ("Saved / Modified") — S — Now

**Why:** The atomic-commit save (`begin_save_document → write_save_chunk* →
commit_save_document`) and the unsaved-close guard (`attach_unsaved_guard` +
`set_window_dirty`) already exist in `apps/shell/src-tauri/src/lib.rs`. Users
can't *see* that safety, so they don't trust it. UX-AUDIT P1.

**Scope**
- A title-bar / toolbar pill in each editor: **Saved · <relative time>**,
  **Modified**, **Saving…**, **Save failed** (retry).
- Drive it off the dirty signal the editors already report via
  `set_window_dirty` (wire the same boolean to the pill), and off save
  success/failure from the bridge `save()/saveAs()` results.
- Reflect window-title `•` modified marker to match.

**Acceptance:** editing flips to *Modified* within 1 frame; a successful save
returns *Saved · just now*; a failed save shows *Save failed* with a retry; the
close-guard prompt only appears when the pill says *Modified*.

**Touches:** docx + sheets `desk-bridge-bootstrap.ts` (already track dirty),
each editor's chrome; optionally surface `warn_on_unsaved_close` (already
persisted) to gate the close prompt.

---

## 2 — Crash recovery / draft journal — M — Now

**Why:** Pure-local, high-trust. If the app or OS dies mid-edit, the user
should get their work back on next launch. UX-AUDIT P1.

**Scope**
- Periodic background snapshot of the in-editor document to a journal file
  under `~/.config/live.schnsrw.casualoffice/journal/<window-id>.<ext>.tmp`
  (reuse the atomic temp-write path in `lib.rs`).
- Journal carries: source path (or "untitled"), bytes, timestamp, dirty hash.
- On launch, scan the journal dir: if an entry is newer than the on-disk file
  (or the file is untitled), offer **"Recover unsaved changes to <name>?"** on
  the launcher (a `Modal`-style prompt) → restore into a new editor window.
- Clear a window's journal entry on clean save and on clean close.

**Acceptance:** kill the app with unsaved edits → relaunch → recovery offer
restores the exact bytes; a normal save+close leaves no journal entry.

**Touches:** new Rust commands (`write_journal`, `list_journal`, `clear_journal`),
both bootstraps (periodic flush), launcher recovery UI in `apps/shell`.
Depends conceptually on #1's dirty signal.

---

## 3 — PDF export (local, no service) — M — Next

**Why:** The single most-requested missing primitive; 100% local, on-thesis —
"I can finish my work here." No print service, no cloud.

**Scope**
- docx: render the paged layout to PDF. Two candidate paths — (a) the editor's
  existing paged layout-painter → `print-to-pdf` via the webview's print
  pipeline, or (b) a deterministic headless render. Prefer the webview
  `print_to_pdf` (Tauri/WRY supports it) for fidelity with what's on screen.
- sheets: export the active workbook/sheet to PDF with page setup (fit-to-width,
  margins) — via the same webview print path or an ExcelJS→layout pass.
- Wire a **File → Export → PDF…** action that routes through a native save
  dialog (reuse `pick_save_path`).

**Acceptance:** a doc and a sheet each export a PDF that visually matches the
editor, fully offline, written via the native save dialog (no `<a download>`).

**Open question:** webview `print_to_pdf` vs. a bundled renderer — spike both
for fidelity before committing.

---

## 4 — Accessibility leadership — M–L — Next

**Why:** The incumbents are mediocre at a11y. "The accessible office suite" is
a defensible, marketable niche. Launcher a11y roles (radio/tab/aria-selected,
focus management, contrast) were just added; the editors are the gap.

**Scope**
- Full **WCAG 2.2 AA** pass across launcher + both editors.
- **Keyboard-only**: every action reachable without a mouse; visible focus
  rings; logical tab order; no keyboard traps (audit Univer's canvas grid and
  ProseMirror surface).
- **Screen reader**: NVDA + VoiceOver smoke scripts; labelled controls,
  live-region announcements for save/status, accessible names on icon buttons.
- **High-contrast / forced-colors** mode; respect `prefers-contrast` and
  `prefers-reduced-motion`.
- Automated gate: `axe-core` Playwright checks in CI on the launcher and a
  representative editor view.

**Acceptance:** axe-core clean on launcher + editor smoke views; documented
VoiceOver/NVDA walkthrough of New → edit → Save with zero blockers.

**Touches:** `apps/shell`, both editors' chrome; new CI a11y job.

---

## 5 — End-to-end-encrypted optional sync — XL — Later

**Why:** Answers "but I have two machines" **without** becoming a cloud product.
Strictly opt-in, bring-your-own-storage, zero-knowledge. Default stays 100%
local; sync is a feature the user turns on, not a dependency.

**Scope (design-first — write an RFC before code)**
- **BYO backend**: user supplies storage (S3-compatible bucket, WebDAV, a
  folder on their own NAS, or a self-hosted endpoint). We ship no servers.
- **Zero-knowledge**: client-side encryption (per-user key derived from a
  passphrase; libsodium/age-style). The storage host sees only ciphertext.
- Sync unit = the encrypted file blob + a small metadata manifest; conflict
  policy = last-writer-wins with a kept conflict copy (no silent overwrite).
- Hard guarantee: with sync **off**, zero network calls (assert in CI).

**Acceptance:** two machines pointed at the same BYO bucket converge; the
bucket contents are unreadable without the passphrase; disabling sync makes the
app fully offline again (network-egress test passes).

**Risk:** key management UX, conflict handling, and the "never leak plaintext"
guarantee are the hard parts — this is an RFC + threat-model first, code second.

---

### Cross-cutting

- **Code-signing / notarization** (macOS + Windows) is a release-quality
  prerequisite that blocks none of the above but gates a public launch; track
  separately from this feature pipeline.
- Each item ships behind tests (Playwright for UX, unit/integration for the
  Rust journal + sync crypto) and updates `docs/PRODUCT_AUDIT.md` status.
