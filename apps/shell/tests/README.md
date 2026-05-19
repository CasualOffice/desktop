# Casual Office — Launcher E2E tests

[Playwright](https://playwright.dev) drives a real Chromium against the
Vite dev server (`http://localhost:5170`). The launcher's Tauri
dependencies — every `invoke()` call, `window.__TAURI__`, drag-drop
events — are mocked inside `_setup.ts` via `page.addInitScript`, so the
wizard / launcher / settings / open-where flows run end-to-end without
booting the Tauri shell.

## Run

From `apps/shell/`:

```bash
pnpm test:e2e             # headless (CI)
pnpm test:e2e:ui          # Playwright inspector
pnpm test:e2e:headed      # watch the browser drive the tests
```

The Vite dev server is started automatically by Playwright's `webServer`
config (and reused if already running locally).

## What's covered

- **Launcher boot**: home renders for an existing profile; wizard
  renders on first run.
- **Wizard**: 3-step setup → reveal home; Continue disabled until name
  is non-empty.
- **Action cards**: clicking New / Open opens the where-modal; Esc
  dismisses; "Remember my choice" persists `open_window_preference`.
- **Settings**: opens via user chip; `aria-pressed` reflects state;
  Escape closes; empty name surfaces error; valid save toasts + returns
  to home.
- **Recent files**: empty state; pinned-first ordering; search filter;
  right-click → context menu.

## What is NOT covered

- Anything that needs Tauri's real IPC: actual file load/save, real
  multi-window behavior, file-association handler, the editor windows.
  Those are tested manually on the release binary today; a future round
  may add `tauri-driver`-based system tests.
- The editor surfaces (docx / sheets) — those have their own test suites
  in their respective upstream repos.

## Adding tests

1. Import `mockTauri` from `_setup`. Pass a `Partial<MockState>` to
   override the default state.
2. `await page.goto('/')` — the mock is injected via `addInitScript`
   before any page script runs, so the launcher boots with your state.
3. Drive the UI with normal Playwright locators.
4. Read or assert the mock state via
   `page.evaluate(() => (window as any).__deskApp_mock_state.<field>)`
   when verifying that an `invoke` mutation landed.
