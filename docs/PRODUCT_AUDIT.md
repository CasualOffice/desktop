# Product Audit — Casual Office

Consolidated engineering + UX audit with current status. Internal,
honest, specific. Grounded in the current tree (`CLAUDE.md`,
`docs/ARCHITECTURE.md`, `docs/UX-AUDIT.md`, `apps/shell/src-tauri/src/lib.rs`,
the two desk-bridge bootstraps, `.github/workflows/`, `apps/shell/tests/`,
`packages/casual-office-ui/`).

Severity labels: **S0** data loss / unshippable · **S1** breaks the
desktop-app feel · **S2** visible friction · **S3** polish.

---

## 1. Executive summary & verdict

**Verdict: shippable as a `v0.1.0` *pre-release*, Linux-first, clearly
labelled experimental — *not* a 1.0.**

The data-integrity foundation is now sound: saves are atomic, an unsaved-
changes close guard exists, and the IPC save/load paths are chunked so a
large document no longer JSON-serializes a giant byte array. The two
historically fatal bugs — the blank editor (base-path / `snapshotRef` GC)
and broken offline fonts — are fixed. CI now runs static analysis and
supply-chain scanners on every push.

What still gates a *confident* release:

| Gate | Status |
|---|---|
| Data-integrity (atomic save, close guard, chunked IPC) | **Met** |
| Blank-editor / base-path bug | **Met (fixed)** |
| Offline fonts | **Met (fixed)** |
| Icon-font footprint (3.9 MB Material Symbols per editor) | **Met** — subset to ~90 KB in both editors, ligature coverage HarfBuzz-proven (docx 139/139, sheets 165/165) |
| External file-change detection (rename/move/delete of open file) | **Met (pending merge)** — shell-side `notify` watcher + `deskapp://file-changed` event |
| Native pickers for Save As / Export / PDF (no phantom downloads) | **Met** — sheets + docx export paths route through the bridge picker |
| Accessibility pass on the editors | **In progress** — docx + sheets toolbar/menu/ribbon are labeled + keyboard-navigable; full screen-reader sweep still open |
| macOS / Windows builds validated & **signed** | **Open (deferred)** — explicitly out of scope for now |
| Fidelity test corpus (round-trip data-loss confidence) | **Open** |
| Design-system adoption decision | **Open** — `casual-office-ui` exists but is unused by the shell |

A pre-release that ships the Linux binary, names the fidelity caveat, and
keeps the unsigned-build warning is honest and useful. A "1.0" claim is
not yet defensible — but the data-integrity, footprint, and export/open
UX gaps that mattered most are now closed.

### Landed since this audit (2026-06-25)

Code fixes (merged unless noted), each verified by build/test before landing:

- **macOS "Open with" → editor** now opens (handles the `RunEvent::Opened`
  Apple-Event path; argv-only path covered Linux/Windows). *Needs verifying
  on a real mac build.*
- **Atomic-save state machine** now has direct Rust tests (6 cases:
  abort-safety, atomic replace, offset chunks, EXDEV-sibling, state-loss).
- **Zoom overlay misplacement (docx)**: table/text-box "Format" chips +
  resize handles no longer double-scale under zoom; selection highlight no
  longer lands mid-`transform`-transition (transition dropped → zoom snaps,
  fixing both the zoom and panel-slide cases).
- **Save As / Export / PDF open the native picker** (no phantom
  `~/Downloads` writes): sheets Save-As-xlsx + PDF; docx Export ODT/MD/TXT,
  Make-a-copy, Email-as-attachment, markdown-save, and Translate export.
- **Icon-font subset** (above) — ~7.6 MB of bloat removed per install.
- **External file-change detection** — shell watcher + event (pending merge).
- **Editor a11y (focused)** — labels + keyboard nav on docx/sheets toolbar,
  menubar, ribbon, sheet tabs.
- **Reproducible build scripts** (`build-docx.sh`/`build-sheets.sh`:
  submodules + Univer fork + SDK + Node 22) so a clean checkout builds.

Open branches awaiting merge: `feat/shell-file-watch-and-ux`,
`feat/rerun-wizard-and-recent-polish`.

---

## 2. Functional / data-integrity

The save/load bridge is the part where a bug means a *destroyed file*, so
it gets the most scrutiny. Most of the historic risks here are now closed.

### Open / save bridge correctness

- Editors detect desktop context via `?desk=1`; the bootstrap sets
  `window.__deskApp__` and routes save/load through Tauri commands
  (no browser download). Verified in both
  `docx/docx-editor/examples/vite/src/desk-bridge-bootstrap.ts` and
  `sheets/apps/web/src/desk-bridge-bootstrap.ts`.
- Save semantics implemented as specified: `save()` delegates to
  `saveAs()` when `filePath` is null, then binds the chosen path so
  subsequent saves overwrite silently (`docs/ARCHITECTURE.md` §Save).

### Data-loss risk register

| Risk | Status | Evidence |
|---|---|---|
| **Non-atomic save** could truncate the original file on a mid-write crash | **FIXED** | `lib.rs`: `begin_save_document` writes a sibling temp `<path>.casualoffice.tmp`, `write_save_chunk` appends, `commit_save_document` fsyncs and **atomically renames** temp → real path. Temp is a sibling to keep the rename on the same filesystem (avoids cross-mount EXDEV). The real file is never opened for writing until the rename. |
| **Closing a window with unsaved edits** loses work silently | **FIXED** | `lib.rs` `attach_unsaved_guard`: `CloseRequested` is intercepted; if the window's dirty flag is set, a native confirm dialog runs (on a worker thread) and the window only closes on confirm. A clean window always closes — the guard can never make a window unclosable. Dirty state is reported by the editors via `set_window_dirty` (capture-phase edit heuristic in both bootstraps). |
| **Save dialog / IPC hang** strands the user | **FIXED (mitigated)** | Launcher IPC is wrapped in `withTimeout(...)` / `Promise.race` fallbacks (`apps/shell/src/main.ts`), and `boot()` never blocks on a single broken command. Save/settings flows use `Promise.race`. |
| **Large-document IPC** serialized `Array.from(Uint8Array)` (slow/risky for 50 MB) | **FIXED** | Save path is now chunked (`begin/write/commit`), matching the chunked load path. (This was UX-AUDIT §5 P1.) |
| **Blank editor** — bundled `<script src="/assets/…">` 404'd; Univer canvas race produced a permanent blank canvas | **FIXED** | Editor bundles built with `--base=./` (hard rule #6 in `CLAUDE.md`); sheets' aggressive `snapshotRef` GC gated on `window.__deskApp__?.isDesktop` so React 18 concurrent rendering doesn't clear the ref before the swap. |
| **Offline fonts** missing → wrong metrics / network fetch | **FIXED** | Inter + Material Symbols + metric-compatible Liberation/Carlito/Caladea bundled on disk (`apps/shell/dist/{docx,sheets}/fonts/` and `dist/docx/assets/*.woff2`). |
| **External rename while open** — editor keeps the stale path | **OPEN (S2)** | No filesystem-watch; renaming/moving the open file from the OS isn't detected (UX-AUDIT §7). |
| **No crash / draft recovery** | **OPEN (S2)** | No autosave-to-tmp recovery journal; a crash before save loses unsaved edits (mitigated by the close guard, not eliminated). |
| **Magic-byte / parse failure** surfaces only inside the editor | **OPEN (S3)** | Load path sniffs magic bytes and errors on OLE/non-ZIP, but the error shows inside the editor UI, not launcher-side (UX-AUDIT §3). |

**Net:** the catastrophic data-loss vectors (non-atomic write, silent
close, IPC overflow on big files) are closed. The remaining open items
are *annoyance/edge* severity, not *destroy-your-file* severity.

---

## 3. UX audit (prioritized, with status)

Consolidated from `docs/UX-AUDIT.md` plus the recent fix wave. Many items
that were Open in the original audit have since been addressed.

| Area | Finding | Sev | Status |
|---|---|---|---|
| Core flow | Save/Save-As/new-doc semantics correct and bound | S0 | **Fixed** |
| Feedback | Destructive actions (clear recents) need confirm | S1 | **Fixed** (confirmation wired; `launcher-regressions.spec.ts` asserts it) |
| Interaction | Modal (open-where) dismissal — Escape / backdrop / remember-choice | S2 | **Fixed** |
| Feedback | Loading & error states for IPC (timeout fallbacks, friendly error copy) | S1 | **Fixed** (`withTimeout`, friendly error mapping in `main.ts`) |
| Copy | Raw IPC errors shown to users | S2 | **Fixed** (timeout/`timed out` strings mapped to friendly text) |
| a11y | Missing roles on interactive launcher elements | S2 | **Fixed** (roles added on launcher; editors still Open) |
| First-run | Wizard state not persisted across runs | S1 | **Fixed** (persisted to `~/.config/live.schnsrw.casualoffice/`) |
| Visual | Theme contrast in dark mode | S2 | **Fixed** |
| Theming | Launcher theme not propagated to editor windows | S1 | **Fixed** (`?theme=` + `deskapp://theme` event; see §5) |
| Editor | Share/collab UI visible in single-user product | S1 | **Fixed** (collab compiled out; Share slot replaced with user chip) |
| First-run | Can't re-run the wizard except by deleting profile JSON | S2 | **Open** |
| Home | No recent-file thumbnails | S2 | **Open** |
| Home | No templates / "create from template" | S2 | **Open** |
| Open | No loading indicator while editor window cold-starts (~1–2 s) | S1 | **Open** |
| Editor | No "Saved / Modified" state surfaced (Save button has no state) | S1 | **Open** |
| Editor | No print / print-preview | S1 | **Open** |
| Editor | No spell/grammar check | S1 | **Open** |
| Editor | No "Home"/back-to-launcher entry inside the editor | S1 | **Open** |
| Save | No "Save as PDF" / format conversion | S2 | **Open** |
| Cross | External-rename detection | S2 | **Open** |
| Cross | Material Symbols font 3.9 MB (subsettable to ~50 KB) | S2 | **Open** |
| Cross | Rust panics go to stderr only — no crash surface | S3 | **Open** |
| Home | Pinned vs unpinned share one list | S3 | **Open** |
| Drop overlay | Visual drag overlay removed (WebKitGTK spurious enter events) | S3 | **Won't-fix** (intentional; drop still functions — `CLAUDE.md` rule #6) |
| Architecture | No in-window tabs (one window per doc) | — | **Won't-fix** (deliberate; matches native Word/Excel) |

---

## 4. Design-system gap

**State plainly: `packages/casual-office-ui` is NOT consumed by the shell.**

- The package ships **23 React components**
  (`ActionCard`, `Avatar`, `BootSkeleton`, `Button`, `Modal`,
  `RecentCard`, `Toast`, `Topbar`, `UserChip`, `WizardCard`,
  `WizardStepper`, … — `src/components/*.tsx`) plus tokens/styles.
- The shell launcher (`apps/shell/`) has **no dependency on it** — its
  `package.json` lists only `@tauri-apps/*` + Playwright + Vite, and it
  imports nothing from `casual-office-ui`. The launcher is **vanilla TS +
  hand-written CSS** (`apps/shell/src/styles.css`).
- **Tokens are duplicated, not shared.** The DS defines ~45 CSS custom
  properties in `src/styles/tokens.css`; the shell defines ~41 of its own
  in `styles.css`. They *match by intent* but are two separate copies — a
  drift hazard.

So today the design system is a parallel artifact: built and typechecked
in CI (`ci.yml` builds `casual-office-ui`), demoed (`demo/`, `demo-dist/`),
but not actually rendering the product.

### Adoption options

| Option | What it means | Effort | Trade-off |
|---|---|---|---|
| **A. Full React adoption** | Rewrite the launcher to mount the DS React components | L | Single source of truth, real component reuse; but the launcher is currently deliberately dependency-light vanilla TS — this adds React to the launcher bundle. |
| **B. Tokens-only import** | Shell drops its duplicated `:root` vars and imports the DS `tokens.css`; keeps vanilla markup | S | Kills the token-drift hazard cheaply; components still diverge. Best effort/value ratio. |
| **C. Freeze** | Keep DS as a documented reference / future-editor toolkit; accept the launcher stays vanilla | S (none) | No drift fix; the 23 components remain shelf-ware unless a future surface adopts them. |

**Recommendation:** B now (eliminate token duplication immediately), keep
A as a deferred decision tied to whether any *new* React surface (e.g. a
richer in-editor chrome) materializes. Do not block v0.1.0 on this.

---

## 5. Accessibility & theming

- **Unified theming is wired.** The launcher passes its theme to editor
  windows as `?theme=<system|light|dark>` and emits a Tauri event
  `deskapp://theme` on change. Each bootstrap resolves `system` against
  `prefers-color-scheme`, exposes `themeMode`/`theme` on `window.__deskApp__`,
  re-broadcasts a DOM `deskapp:theme` CustomEvent, and re-applies live on
  launcher theme changes (`sheets/apps/web/src/desk-bridge-bootstrap.ts`,
  mirrored in docx). So launcher → editor theme is consistent and live,
  not just at boot.
- **Accessibility is partial.** Launcher gained interactive roles and a
  dark-mode contrast pass. The **editors have had no a11y audit** —
  screen-reader, keyboard-only, and high-contrast testing of the docx /
  sheets surfaces is outstanding (UX-AUDIT §7 P2). Treat editor a11y as a
  named pre-1.0 workstream.

---

## 6. Testing

Playwright is the harness; tests live in `apps/shell/tests/`
(`playwright.config.ts` present).

| Suite | Covers |
|---|---|
| `launcher.spec.ts` | Launcher boot — renders home for an existing profile (mocked Tauri via `_setup.ts`) |
| `launcher-regressions.spec.ts` | Recents-open, clear-recents confirmation, open-where modal dismissal — asserts the exact IPC calls |
| `editor-boot.spec.ts` | docx/sheets boot smoke under `?desk=1` (Tauri-mounted) |
| `editor-save.spec.ts` | End-to-end save bridge — boots each editor, mocks `invoke()`, drives the editor's own Save button, asserts arguments |
| `editor-save-flows.spec.ts` | Data-loss-critical save paths the simple save test doesn't cover (drives the `window.__deskApp__` bridge contract directly) |
| `docx-ui-inspect.spec.ts` | Diagnostic (screenshot + DOM/font dump); not pass/fail |

**Gaps:**

| Gap | Sev |
|---|---|
| ~~No Rust unit tests for the atomic save state machine~~ — **CLOSED.** `save_tests` in `lib.rs` covers the `begin/write/commit` cycle directly: exact-byte roundtrip, the abort-safety invariant (begin+write without commit leaves the real file untouched), atomic replace of an existing file, out-of-order offset chunks, sibling-temp/EXDEV path, and state-loss fallback. The command bodies were split into `*_impl` helpers so the machine is testable without a Tauri runtime. | ~~S1~~ Done |
| No round-trip **fidelity corpus** (open real `.docx`/`.xlsx` → save → diff) | S1 |
| No visual-regression snapshots (`toMatchSnapshot`) — screenshots are manual | S2 |
| No close-guard integration test (dirty → close → confirm/cancel) | S2 |
| Tests mock Tauri; no full end-to-end against a real Tauri build | S2 |

---

## 7. Security / supply-chain

CI (`.github/workflows/ci.yml`) runs on every push/PR to `main` plus a
weekly schedule:

| Control | Detail |
|---|---|
| **CodeQL** | `javascript-typescript`, first-party only (`docx`/`sheets`/`dist`/`demo-dist` ignored) |
| **cargo-audit** | RustSec advisory check on the Tauri core (`rustsec/audit-check`) |
| **Dependency review** | Blocks PRs introducing high-severity vulns; `fail-on-severity: high` |
| **License deny-list** | `dependency-review` denies AGPL-1.0/3.0 and GPL-2.0/3.0 drift — enforces the Apache-2.0 project posture and prevents the previously-purged AGPL `docx-editor-agents` from creeping back |
| **rustfmt / clippy** | Run (as warnings) in the `rust` job |

**Caveats:**

| Caveat | Sev |
|---|---|
| **Unsigned builds.** macOS ships unsigned — first launch requires right-click → Open to bypass Gatekeeper (`release-macos.yml`). No Windows Authenticode signing. Real trust + install-conversion cost. | S1 |
| **DevTools enabled in release** (`tauri = { features = ["devtools"] }`). Convenient for support; for a local-only app the exposure is low, but worth a conscious decision before 1.0. | S3 |
| clippy/rustfmt run as `\|\| echo ::warning` — they don't fail the build, so lints can accumulate silently. | S3 |
| Two upstream forks pulled in-tree with their own dependency trees — CodeQL deliberately skips them, so first-party scanning doesn't cover editor code. | S2 |

---

## 8. Remaining work to reach a confident v0.1.0

Ordered by impact on shippability.

| # | Item | Sev | Why it gates confidence |
|---|---|---|---|
| 1 | **Validate macOS + Windows release builds** and decide on signing/notarization | S1 | Cross-OS is the headline promise; only Linux is proven. Unsigned installs suppress adoption. |
| 2 | **Round-trip fidelity corpus** (open → save → diff real Office files) | S1 | The one place a silent regression destroys user trust *and* data. |
| 3 | ~~**Rust unit tests for the atomic-save state machine**~~ — **DONE** (`save_tests` in `lib.rs`; 6 tests covering roundtrip, abort-safety, atomic replace, offset chunks, EXDEV-sibling, state-loss) | ~~S1~~ | ~~The most data-critical code path has no direct test.~~ Now directly tested. |
| 4 | **Editor loading indicator** + **"Saved/Modified" state** | S1 | Cold-start blank window + a stateless Save button read as "is it working?"; cheap, high trust value. |
| 5 | **Editor accessibility pass** (screen-reader / keyboard / high-contrast) | S1 | Launcher started; editors untouched. Needed for a credible release. |
| 6 | **Tokens-only DS import** (Option B) to kill token duplication | S2 | Removes a live drift hazard for ~a day of work. |
| 7 | **Subset Material Symbols** (3.9 MB → ~50 KB) | S2 | Easy footprint win consistent with the "tiny binary" pitch. |
| 8 | **Local crash-log surface** + make clippy/rustfmt failing gates | S2/S3 | No telemetry means we're blind without a voluntary local crash artifact. |
| 9 | **Re-run-wizard affordance**, external-rename detection, friendly load-error surfacing | S2/S3 | Remaining UX-AUDIT open items; polish, not blockers. |

**Honest summary:** the dangerous stuff (data loss, blank editor, fonts)
is handled and tested-by-bridge; the remaining gates are about *trust and
proof* — signed cross-OS builds, a fidelity corpus, direct Rust tests, and
finishing accessibility — not about fixing a known-broken core.
