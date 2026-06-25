#!/usr/bin/env bash
# Build the sheets editor bundle for the desktop shell.
#
# Steps that the stock `pnpm install && vite build` does NOT cover and that
# a clean checkout needs:
#   1. Init the `univer-revamp` + `design-system` submodules (the `apps/server`
#      collab submodule is skipped — the desktop shell is single-user).
#   2. `pnpm fork:setup` — every `@univerjs/*` package is `link:`-ed to the
#      vendored fork via the root `pnpm.overrides`, and the fork ships no
#      prebuilt `lib/`, so it must be compiled + swapped to the lib shape.
#   3. Root `pnpm install` — resolves the `link:` overrides into the workspace.
#   4. Build the `@casualoffice/sheets` SDK — the web app imports
#      `@casualoffice/sheets/xlsx` from the SDK's `dist/`, which tsup emits.
#   5. Build the web app with `--base=./` for the /sheets/ mount path.
#
# Node 22+ is REQUIRED: the Univer fork's `engine-render` prepare hook runs
# `node --experimental-strip-types`, which Node 20 rejects. pnpm is sourced
# via corepack so its version tracks each package's `packageManager` field.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHEETS="$ROOT/sheets"

# --- Node 22 via nvm, if available ------------------------------------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm install 22 >/dev/null 2>&1 || true
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "error: sheets build needs Node >= 22 (have $(node -v))." >&2
  echo "       The vendored Univer fork's prepare hook uses --experimental-strip-types." >&2
  exit 1
fi

corepack enable >/dev/null 2>&1 || true

cd "$SHEETS"
echo "==> init submodules: univer-revamp + design-system (collab/apps/server skipped)"
git submodule update --init vendor/univer-revamp vendor/design-system

echo "==> build Univer fork (pnpm fork:setup)"
pnpm fork:setup

echo "==> install workspace (resolves link: overrides)"
pnpm install --no-frozen-lockfile

echo "==> build SDK (@casualoffice/sheets)"
pnpm --filter @casualoffice/sheets build

echo "==> build web app (--base=./)"
( cd apps/web && pnpm vite build --base=./ )
echo "==> sheets editor built: $SHEETS/apps/web/dist"
