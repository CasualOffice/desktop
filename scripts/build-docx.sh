#!/usr/bin/env bash
# Build the docx editor demo bundle for the desktop shell.
#
# Initialises the design-system submodule (the editor imports
# `@schnsrw/design-system` via `file:../../vendor/design-system`), then
# builds with `--base=./` so the bundled `<script src>` resolves under the
# editor's mount path (/docx/) instead of the webview root.
#
# The `collab` submodule is intentionally NOT initialised — the desktop
# shell is single-user and never loads the co-edit runtime.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/docx"

echo "==> init design-system submodule (collab skipped)"
git submodule update --init docx-editor/vendor/design-system

cd docx-editor
echo "==> bun install"
bun install
echo "==> build demo (--base=./)"
bun run build:demo -- --base=./
echo "==> docx editor built: $ROOT/docx/docx-editor/examples/vite/dist"
