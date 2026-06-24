# design-sync notes — Casual Office Design System

Project: `Casual Office Design System` (d2c6a9e4-0bc2-4609-ab64-b921e882c97b)
Source package: `packages/casual-office-ui` (shape: package, React + Vite lib build)

## How this DS was created
The repo (a Tauri desktop shell) had no component library — the visual language
lived only in `apps/shell/index.html` + `apps/shell/src/styles.css`. The
`packages/casual-office-ui` package was authored to extract that language into a
real React + TS component library (23 components), then synced. The shell app
itself is still vanilla TS and does NOT yet consume this package.

## Build / re-sync
- Build the DS: `pnpm --filter casual-office-ui build` (emits `dist/index.es.js`
  + `dist/casual-office-ui.css` + `dist/*.d.ts`).
- `--node-modules ./packages/casual-office-ui/node_modules` (react resolves there
  via pnpm symlink), `--entry ./packages/casual-office-ui/dist/index.es.js`.
- Playwright **1.60.0** matches the cached chromium build 1223 (`~/Library/Caches/ms-playwright/chromium-1223`).
  Installed into `.ds-sync/` for the render check — reuses the cache, no 200MB download.

## Known render warns (triaged — not new issues)
- `[RENDER_THIN] Modal` — false positive. Modal is `cardMode: single` (overlay);
  the thin-text heuristic misreads its full-bleed default render. Both stories
  (OpenWhere, WhatsNew) render full dialogs and grade good. Ignore on re-sync.

## Decisions
- Fonts: the DS is **system-font-first** by design (matches the real app's
  `-apple-system, system-ui, …` stack). Dropped `'Inter'`/`'JetBrains Mono'` from
  the token stacks so no `@font-face` is needed — `[FONT_MISSING]` is resolved,
  not suppressed. Do NOT re-add named webfonts unless the brand actually ships them.
- `overrides`: 11 components are `cardMode: column` (full-width compositions),
  `Modal` is `cardMode: single` (overlay). These are presentation-only.

## Re-sync risks (watch-list)
- Preview compositions hard-code realistic sample data (file names, user names).
  Purely cosmetic — safe to leave, but they don't track any real source.
- `ThemeCard`/`SegmentedFilter`/`SearchInput` previews render a fixed selected
  state (no interaction) — hover/focus states are not captured by design.
- The conventions header (`conventions.md`) enumerates `--co-*` tokens and props;
  if a token is renamed in `tokens.css`, re-validate the header against the build.
- If the shell app later imports this package, keep the package the source of
  truth — don't fork the styles back into `apps/shell/src/styles.css`.
