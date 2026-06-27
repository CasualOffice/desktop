# Auto-update

Casual Office updates itself from this repo's GitHub Releases. On launch the
launcher checks for a newer **signed** build and, if the user agrees, downloads
and installs it, then relaunches. The check is opt-out via Settings →
"Automatically check for updates".

This is **update signing**, not OS code-signing. We do **not** buy an Apple
Developer certificate or a Windows EV certificate — the installers stay
"unsigned" in the OS sense (macOS users right-click → Open on first launch).
The updater signature is a free [minisign](https://jedisct1.github.io/minisign/)
keypair that only proves an update genuinely came from this repo; it costs
nothing.

## How it works

- **Endpoint** (`tauri.conf.json` → `plugins.updater.endpoints`):
  ```
  https://github.com/CasualOffice/desktop/releases/latest/download/{{target}}-{{arch}}.json
  ```
  `{{target}}-{{arch}}` expands per platform — `darwin-aarch64`, `darwin-x86_64`,
  `linux-x86_64`, `windows-x86_64`. Each platform fetches **its own** manifest
  file, so the parallel platform build jobs never race on one shared
  `latest.json`.

- **Per-target manifest** (one small JSON per platform, uploaded to the release):
  ```json
  {
    "version": "0.0.2",
    "pub_date": "2026-06-27T…Z",
    "platforms": {
      "darwin-aarch64": {
        "signature": "<contents of the .sig file>",
        "url": "https://github.com/CasualOffice/desktop/releases/download/v0.0.2/Casual%20Office.app.tar.gz"
      }
    }
  }
  ```
  macOS is a universal binary, so the build emits **both** `darwin-aarch64.json`
  and `darwin-x86_64.json` pointing at the same `.app.tar.gz`.

- **Signed artifacts** (`bundle.createUpdaterArtifacts: true`): each build emits
  the updater artifact plus a `.sig` — macOS `.app.tar.gz`, Linux `.AppImage`,
  Windows NSIS `-setup.exe`. The build signs them with the private key from the
  `TAURI_SIGNING_PRIVATE_KEY` CI secret; the app verifies them against
  `plugins.updater.pubkey`.

- **Which installs can auto-update:** in-place update works for the **AppImage**
  (Linux), the **`.app`** (macOS), and the **NSIS `-setup.exe`** (Windows). It
  does **not** work for a **`.deb`** (the updater only replaces an AppImage via
  `$APPIMAGE`) or a **`.msi`** (only NSIS is updatable). The launcher's
  `is_update_supported` command gates the check so a `.deb` user isn't offered
  an update that can't apply; the `.msi` case isn't reliably detectable at
  runtime, so a `.msi` user may see an offer that no-ops — prefer the
  `-setup.exe` on Windows if you want auto-updates.

## Keys

- Generated once with `pnpm tauri signer generate` (empty password).
- **Public** key: committed in `tauri.conf.json` → `plugins.updater.pubkey`.
- **Private** key: the repo secret `TAURI_SIGNING_PRIVATE_KEY`. It is NOT in the
  repo. The local copy lives at `~/.tauri/casualoffice-updater.key`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is unused (the key has no password); the
  workflow reference resolves to empty, which is correct.

**Rotating the key** invalidates auto-update for everyone on the old key — they
have to reinstall manually once. To rotate: generate a new keypair, replace the
`pubkey` in `tauri.conf.json`, update the `TAURI_SIGNING_PRIVATE_KEY` secret,
and ship a release. Don't rotate casually.

## Release checklist

1. Bump the app version in **all** version files so the binary, the JS layer,
   and the updater manifest agree (a mismatch makes the updater re-install the
   same build forever — `release.yml`'s "Verify version matches tag" step
   fails the release if `tauri.conf.json` doesn't match the tag):
   - `apps/shell/src-tauri/tauri.conf.json`
   - `apps/shell/src-tauri/Cargo.toml` (run `cargo check` to refresh `Cargo.lock`)
   - `package.json`, `apps/shell/package.json`, `packages/casual-office-ui/package.json`
2. Ensure the `TAURI_SIGNING_PRIVATE_KEY` repo secret is set.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The `release.yml` workflow builds, signs, and publishes one GitHub Release.
   Its `editors` job builds the editor bundles once on Ubuntu; the `linux` /
   `macos` / `windows` jobs download them and build + sign only the native
   shell; the `finalize` job publishes the Release **once all three succeed**
   (so it's never partial): installers (`.dmg` / `.deb` / `.AppImage` / `.msi` /
   `.exe`), the updater artifacts + `.sig`, and the per-target `.json` manifests.
   A hyphenated tag (e.g. `vX.Y.Z-rc1`) is published as a pre-release, so the
   `releases/latest/download/` alias the updater queries skips it.
5. Installed apps on the previous version see the update on next launch.

**Validate first.** The release pipeline only runs on a tag, but you can dry-run
it without tagging: `gh workflow run release.yml -f tag=vX.Y.Z-rc1` (or push a
pre-release tag). Confirm all platform jobs upload their bundle + `.sig` +
manifest and `finalize` publishes the Release. Because hyphenated tags are
marked pre-release, an RC never becomes the `latest` the updater serves.

> **Editor bundles build on Ubuntu** for every platform: `release.yml`'s
> `editors` job builds docx + sheets once and the native jobs download the
> result. This is required for Windows — the vendored Univer fork doesn't
> compile there (`ERR_UNSUPPORTED_ESM_URL_SCHEME`) — and isolates the signing
> key from the editor repos' install scripts on all platforms.
>
> **Updater coverage is x86_64 only.** Only `linux-x86_64`, `windows-x86_64`,
> and the two `darwin-*` (universal) manifests are emitted. An ARM Linux/Windows
> host would request `linux-aarch64.json` / `windows-aarch64.json`, get a 404,
> and silently not update until ARM builds exist.
