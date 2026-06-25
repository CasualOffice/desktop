# Release Tracker — Casual Office

Single source of truth for what's done vs. pending toward a confident
release. Updated 2026-06-25. Severity: **S0** data loss · **S1** breaks the
desktop-app feel · **S2** visible friction · **S3** polish.

Repos: **desktop** (`CasualOffice/desktop`, this repo) · **docs**
(`CasualOffice/docs`, the docx editor, cloned in `docx/`) · **sheets**
(`CasualOffice/sheets`).

---

## ✅ Done — merged to `main`

| Item | Sev | Repo |
|---|---|---|
| Remotes migrated `schnsrw → CasualOffice` (+ CI clone URLs, README) | — | all |
| Reproducible build scripts (submodules + Univer fork + SDK + Node 22) | S1 | desktop |
| Atomic-save state machine — 6 direct Rust tests (abort-safety, atomic replace, EXDEV, offset chunks, state-loss) | S1 | desktop |
| macOS "Open with" opens the editor (`RunEvent::Opened` Apple-Event path) — ⚠ needs verifying on a real mac build | S1 | desktop |
| Zoom overlay misplacement — format chips/resize handles `/zoom`; selection highlight no longer measured mid-transition (covers zoom + panel-slide) | S1 | docs |
| Save As / Export → native picker, no silent overwrite (sheets xlsx) | S1 | sheets |
| Export PDF → native picker, no phantom download (sheets) | S1 | sheets |
| Export ODT/MD/TXT, Make-a-copy, Email, markdown-save, Translate → native picker via `onExport` (docs) | S1 | docs |
| Material Symbols icon font subset — 3.93 MB → **88 KB** (139/139 ligatures HarfBuzz-proven) | S2 | docs |
| Material Symbols icon font subset — 3.93 MB → **99.6 KB** (165/165 proven) + reproducible script | S2 | sheets |
| Focused a11y — toolbar/menubar/ribbon/sheet-tabs labeled + keyboard-navigable | S1 | docs, sheets |

## 🟡 Pending merge — branches pushed, verified, awaiting review

| Branch | Repo | What |
|---|---|---|
| `feat/shell-file-watch-and-ux` | desktop | External rename/move/delete detection (`notify` watcher + `deskapp://file-changed` event) + friendly launcher-side load-error preflight |
| `feat/rerun-wizard-and-recent-polish` | desktop | Non-destructive "re-run setup" + recent-file type badges |
| `docs/release-status-update` | desktop | This tracker + PRODUCT_AUDIT refresh |

## 🔧 In progress / partial

| Item | Sev | Notes |
|---|---|---|
| Editor accessibility | S1 | Toolbar/menu/ribbon/tabs done; **full screen-reader sweep** of editor surfaces still open |

## ⬜ Pending — not started (prioritized)

| # | Item | Sev | Where |
|---|---|---|---|
| 1 | **Editor UI for external-file-change** — consume `deskapp://file-changed` in the docx/sheets bridges (toast + reconcile/read-only when the open file is renamed/deleted) | S2 | docs, sheets |
| 2 | **Round-trip fidelity corpus** (open real `.docx`/`.xlsx` → save → diff) — the one place a silent regression destroys data + trust | S1 | docs, sheets |
| 3 | **Floating-image visual fidelity** — anchored images render as a placeholder block (the "peach box") instead of the image/tight-wrap | S2 | docs |
| 4 | **Crash / draft recovery** — autosave-to-tmp journal so a crash before save doesn't lose edits (close-guard mitigates, doesn't eliminate) | S2 | desktop |
| 5 | **Full editor screen-reader pass** — beyond toolbars: document surface, dialogs, panels, contrast | S1 | docs, sheets |
| 6 | **Design-system tokens adoption (Option B)** — shell imports DS `tokens.css`, drops duplicated `:root` vars (kills drift) | S2 | desktop |
| 7 | **Recent-file thumbnails / templates** home-screen completeness | S3 | desktop |

## 🚫 Deferred (out of scope per current call)

| Item | Why |
|---|---|
| macOS / Windows build validation + code signing / notarization | Explicitly deferred — not spending on it now |

---

### Verification posture

Every landed code change was verified before merge by the relevant build/test
(`cargo build`/`cargo test`, `bun run typecheck` + `build:demo`, `tsc -b` +
`vite build`, Playwright where applicable, and HarfBuzz coverage proofs for
the font subsets). Visual UX changes still benefit from a human pass in the
running app — the headless box can build and screenshot but can't click-drive
every flow.
