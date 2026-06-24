# Casual Office design system

The component library behind the Casual Office desktop launcher (a Tauri shell
for `.docx`/`.xlsx`). System-font, calm, Office-Backstage feel. Light **and**
dark from one set of tokens.

## Setup — no provider, one stylesheet

There is **no** React context/provider to wrap. Two things make components look
right:

1. **Import the stylesheet once** at your app root:
   `import 'casual-office-ui/styles.css';` — without it every component renders
   as unstyled browser defaults.
2. **Theme via a `data-theme` attribute** on a parent (usually `<html>`):
   `data-theme="light"`, `"dark"`, or `"system"` (follows the OS). Omit it and
   you get light. Theme switching is pure CSS — no JS, no re-render.

## Styling idiom — props + CSS custom properties, NOT utility classes

This is a **prop-and-token** system. There are **no** public utility classes to
compose (the internal class names are all `co-`-prefixed implementation detail —
do not hand-write them). Style in two ways only:

- **Component props** carry the design language. Examples that exist today:
  `Button variant="primary|secondary|link|icon"`, `ActionCard tone="docx|sheets|neutral"`,
  `Avatar size="sm|lg"`, `Toast variant="neutral|success|error"`,
  `Modal wide`, `RecentCard kind="docx|sheets" pinned`. Reach for a prop before
  any custom CSS.
- **Re-theme by overriding `--co-*` tokens** on a parent. The whole palette is
  CSS variables; set them to rebrand without touching components. Key tokens:
  `--co-accent` (primary action / focus), `--co-accent-fg`, `--co-bg`,
  `--co-surface`, `--co-surface-2`, `--co-fg`, `--co-muted`, `--co-line`,
  `--co-tile`, `--co-docx` (blue doc accent), `--co-sheets` (green sheet
  accent), `--co-warn`, `--co-success`, `--co-danger`, `--co-radius` /
  `--co-radius-sm` / `--co-radius-lg`, `--co-shadow-1` / `--co-shadow-2`,
  `--co-font-sans` / `--co-font-mono`. For your own layout glue (grids, gaps),
  reference these same tokens (e.g. `gap: 12px; color: var(--co-muted)`).

## Where the truth lives

- `styles.css` and its imports (`tokens.css`, `components.css` / `_ds_bundle.css`)
  — the full token list and every component rule.
- Each component's `<Name>.prompt.md` and `<Name>.d.ts` — its exact props.

## One idiomatic example

```tsx
import { Topbar, UserChip, ActionCard } from 'casual-office-ui';
import 'casual-office-ui/styles.css';

// data-theme="dark" on a parent flips the whole tree.
<div>
  <Topbar brand="Casual Office" actions={<UserChip name="Sachin Sarwa" />} />
  <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
    <ActionCard tone="docx" title="New document" subtitle="Blank .docx" />
    <ActionCard tone="sheets" title="New spreadsheet" subtitle="Blank .xlsx" />
    <ActionCard dashed title="Open file" subtitle=".docx, .xlsx, .csv" />
  </section>
</div>
```

Compose real components for structure; use `--co-*` tokens for your own spacing
and color. Don't reimplement a component's look with custom CSS — pick the prop.
