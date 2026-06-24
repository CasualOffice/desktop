# casual-office-ui

The **Casual Office** design system — the React component library behind the
deskApp launcher (home screen, settings, wizard, modals, recents).

It is the single source of truth for the app's visual language: design tokens
(light/dark via `data-theme`), the docx/sheets brand accents, and ~23 typed
components (`Button`, `Field`, `ActionCard`, `RecentCard`, `ThemeCard`,
`Modal`, `Toast`, `SegmentedFilter`, `WizardStepper`, …).

## Usage

```tsx
import { Button, ActionCard } from 'casual-office-ui';
import 'casual-office-ui/styles.css';

<Button variant="secondary">Cancel</Button>
```

## Styling idiom

Components are styled by a shipped stylesheet (`styles.css`) built from CSS
custom properties. The tokens are the design language — re-theme by overriding
`--co-*` variables (e.g. `--co-accent`, `--co-surface`) on a parent, or flip
light/dark with `data-theme="dark"` on the document root.

## Build

```sh
pnpm --filter casual-office-ui build
```

Emits `dist/index.es.js` (ESM, React externalized), `dist/casual-office-ui.css`
(tokens + component styles), and `dist/*.d.ts` type declarations.
