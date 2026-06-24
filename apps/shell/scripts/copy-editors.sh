#!/usr/bin/env bash
# Copy each editor's built dist into apps/shell/public/{docx,sheets}/.
# Vite serves public/ at the root URL in both dev and prod builds,
# so editor windows can load /docx/index.html or /sheets/index.html.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(cd ../.. && pwd)"
PUBLIC="$(pwd)/public"

DOCX_DIST="$ROOT/docx/docx-editor/examples/vite/dist"
SHEETS_DIST="$ROOT/sheets/apps/web/dist"

if [[ ! -d "$DOCX_DIST" ]]; then
  echo "ERROR: docx dist missing at $DOCX_DIST" >&2
  echo "Run: pnpm build:docx (from repo root)" >&2
  exit 1
fi
if [[ ! -d "$SHEETS_DIST" ]]; then
  echo "ERROR: sheets dist missing at $SHEETS_DIST" >&2
  echo "Run: pnpm build:sheets (from repo root)" >&2
  exit 1
fi

mkdir -p "$PUBLIC"
rm -rf "$PUBLIC/docx" "$PUBLIC/sheets"
cp -R "$DOCX_DIST" "$PUBLIC/docx"
cp -R "$SHEETS_DIST" "$PUBLIC/sheets"

# Offline fonts for the desktop build. The sheets bootstrap declares @font-face
# at ./fonts/ (relative to /sheets/) only when isDesktop(); the web build uses
# the Google Fonts CDN and ships no woff2, so we supply them here. Without this
# the desktop app falls back to system fonts when offline.
mkdir -p "$PUBLIC/sheets/fonts"
cp "$(pwd)/assets/fonts/"*.woff2 "$PUBLIC/sheets/fonts/"

# Same for docx: its bootstrap declares the 'Material Symbols Outlined' icon
# font at ./fonts/ (relative to /docx/) only when isDesktop(). The web build
# uses the Google Fonts CDN, so we supply the woff2 here. Body text uses system
# fonts already; only the icon font needs bundling for offline icon rendering.
mkdir -p "$PUBLIC/docx/fonts"
cp "$(pwd)/assets/fonts/material-symbols-outlined.woff2" "$PUBLIC/docx/fonts/"

# Brand logo at the app root. The docx editor's title-bar + Home marks render
# <img src="/logo.svg"> — an absolute path that, on the web, resolves to the
# server root. In the desktop bundle each editor is mounted under /docx/ or
# /sheets/, so the editor's own logo at /docx/logo.svg is never hit by that
# absolute reference. We copy the docx logo to the app root so `/logo.svg`
# resolves route-independently (sheets only uses the string as placeholder
# text, never as an <img>, so a single root logo is correct for both).
cp "$PUBLIC/docx/logo.svg" "$PUBLIC/logo.svg"

echo "Editors copied:"
echo "  $PUBLIC/docx (from $DOCX_DIST)"
echo "  $PUBLIC/sheets (from $SHEETS_DIST)"
echo "  $PUBLIC/sheets/fonts (from $(pwd)/assets/fonts)"
echo "  $PUBLIC/docx/fonts (material-symbols-outlined.woff2 from $(pwd)/assets/fonts)"
echo "  $PUBLIC/logo.svg (root brand mark for the editors' absolute /logo.svg)"
