<p align="center">
  <img src="apps/shell/src-tauri/icons/128x128@2x.png" width="112" alt="Casual Office" />
</p>

<h1 align="center">Casual Office</h1>

<p align="center">
  <strong>A private, local-only desktop office suite.</strong><br/>
  Edit Word &amp; Excel documents on your machine — no account, no cloud, no telemetry.
</p>

<p align="center">
  <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-555" />
  <img alt="Shell license" src="https://img.shields.io/badge/shell-Apache--2.0-blue" />
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-orange" />
  <img alt="Built with Tauri" src="https://img.shields.io/badge/built%20with-Tauri%202-24C8DB" />
</p>

---

Casual Office is a Tauri 2 desktop shell that wraps two mature browser editors into one
single-user app for everyday documents. Files live **on your disk** — the shell reads and
writes them through native OS dialogs and saves back in place. There is no sign-in, no sync
server, and nothing leaves your machine.

| | |
|---|---|
| **`.docx` · `.txt` · `.md`** | [Casual Office docx editor](https://github.com/CasualOffice/docs) — MIT fork of `eigenpal/docx-editor`; React + ProseMirror, OOXML-faithful |
| **`.xlsx` · `.xlsm` · `.ods` · `.csv` · `.tsv`** | [Univer OSS](https://github.com/dream-num/univer) — Apache-2.0 canvas grid + formula engine |
| **Shell** | Tauri 2 (Rust core + vanilla-TS launcher), system webview, ~15–16 MB binary, one codebase for macOS/Windows/Linux |

Each open document gets **its own OS window** (its own webview process — like native Word/Excel):
no tabs, no shared process. The launcher window stays open as your home base.

## Why Casual Office

- **Private by construction** — local-only, offline-first, zero telemetry, no account.
- **Your files, native** — saves write back to the real file (no browser "download" flow); set it as your OS default opener for `.docx`/`.xlsx`.
- **Lightweight** — a single small binary on the system webview, not a bundled browser.
- **Open source** — Apache-2.0 shell; permissively-licensed editors.

See [`docs/COMPETITIVE_ANALYSIS.md`](docs/COMPETITIVE_ANALYSIS.md) for how it compares to
MS 365, Google, LibreOffice, OnlyOffice and others, and [`docs/ROADMAP.md`](docs/ROADMAP.md)
for what's next.

## Install

> Builds are currently **unsigned**. On first launch your OS may warn you — this is expected
> for an open-source app without a paid signing certificate.

**macOS** — download the `.dmg` from [Releases](https://github.com/CasualOffice/desktop/releases),
drag **Casual Office** to Applications, then on first launch:

```sh
xattr -dr com.apple.quarantine "/Applications/Casual Office.app"   # clear Gatekeeper quarantine
```

**Windows** — run the `.msi` or `.exe` installer from Releases (SmartScreen → *More info → Run anyway*).

**Linux** — install the `.deb` or run the `.AppImage` from Releases.

Once installed, set Casual Office as the default app for `.docx`/`.xlsx`/`.txt`/`.md` in your
file manager to open documents directly.

## What works today

- First-run setup wizard (name, email, timezone, theme, default folder) — **skippable**, with input persistence.
- Profile, settings (incl. **privacy mode** / screen-capture exclusion), and a **unified theme** (light/dark/system) that propagates from the launcher into every editor window.
- Home screen with **recent files** — search, type filter, pin/unpin, copy-path, right-click menu.
- Open `.docx`, `.txt`, `.md`, `.xlsx`, `.xlsm`, `.ods`, `.csv`, `.tsv` from disk or by drag-and-drop.
- **Open-where** dialog ("this window or new?") with a remembered preference.
- **Crash-safe saving** — atomic temp-file write + rename (a failed save can't corrupt your file), and an **unsaved-changes guard** prompts before closing a modified window.
- Editors boot straight into the document (no web dashboard), with a themed loading screen; the title-bar logo returns you to the launcher.
- Offline-complete: editor icon fonts are bundled (no CDN); works with no network.
- File associations for OS default-app registration; DevTools enabled in release (right-click → Inspect).

## Build from source

The two editors are **separate git repos** cloned in-tree (gitignored here, versioned upstream).

Toolchain: **Rust + Cargo**, **Node 20+ / pnpm 9+**, **Bun ≥ 1.3** (docx editor), and the Tauri CLI.

```bash
git clone https://github.com/CasualOffice/desktop.git
cd desktop

# One-time: clone the two editor source repos in-tree.
git clone https://github.com/CasualOffice/docs.git   docx
git clone https://github.com/CasualOffice/sheets.git sheets

pnpm install
pnpm prep:editors        # build both editor bundles (--base=./) + copy into apps/shell/public/

pnpm tauri:dev           # dev: Vite HMR + Tauri
pnpm tauri:build         # release bundles for the current OS
```

On Ubuntu 22.04 you'll also need the Tauri system deps:

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev libssl-dev librsvg2-dev \
  libayatana-appindicator3-dev build-essential curl wget file xdg-utils
```

Tests: `pnpm --filter @deskapp/shell test:e2e` (Playwright). CI runs CodeQL, `cargo audit`,
dependency review and a license-deny gate on every PR (`.github/workflows/ci.yml`); the
`release-*.yml` workflows build per-OS bundles on `v*` tags.

## Architecture

```
                              Casual Office (Tauri 2)
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                  ┌──────────────┐         ┌─────────────────┐
                  │  Launcher    │         │  Doc window 1   │  ← own webview
                  │  window      │         │  (.docx)        │    process
                  │  • Wizard    │         └─────────────────┘
                  │  • Home      │         ┌─────────────────┐
                  │  • Settings  │         │  Doc window 2   │  ← own webview
                  │  • Open-where│         │  (.xlsx)        │    process
                  └──────┬───────┘         └─────────────────┘
                         │ invoke('open_document_window', { kind, file })
                         ▼
                ┌──────────────────────────────────────────────┐
                │  Tauri Rust core  (apps/shell/src-tauri)     │
                │  load / atomic save / save-as / recents /    │
                │  profile / settings / theme / privacy /      │
                │  open-window / unsaved-close guard           │
                └──────────────────┬───────────────────────────┘
                                   ▼
                ~/.config/live.schnsrw.casualoffice/
                  ├─ profile.json   ├─ settings.json
                  ├─ recent.json    └─ avatar.<ext>
```

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
engineering + UX status: [`docs/PRODUCT_AUDIT.md`](docs/PRODUCT_AUDIT.md).

## Project status

**v0.1.0 pre-release.** Core open/save is reliable (atomic saves, unsaved-close guard); the
launcher and both editors render and save natively across macOS/Windows/Linux. Known gaps and
the path to a confident release are tracked in [`docs/PRODUCT_AUDIT.md`](docs/PRODUCT_AUDIT.md).

## License

Casual Office shell: **Apache-2.0**. Upstream editors keep their own licenses
(docx editor **MIT**, Univer **Apache-2.0**).
