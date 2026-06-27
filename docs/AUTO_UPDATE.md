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
  file, so the three release workflows never race on one shared `latest.json`.

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
   same build forever — `release-*.yml`'s "Verify version matches tag" step
   fails the release if `tauri.conf.json` doesn't match the tag):
   - `apps/shell/src-tauri/tauri.conf.json`
   - `apps/shell/src-tauri/Cargo.toml` (run `cargo check` to refresh `Cargo.lock`)
   - `package.json`, `apps/shell/package.json`, `packages/casual-office-ui/package.json`
2. Ensure the `TAURI_SIGNING_PRIVATE_KEY` repo secret is set.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The three `release-*.yml` workflows build, sign, and upload to one GitHub
   Release: installers (`.dmg` / `.deb` / `.AppImage` / `.msi` / `.exe`), the
   updater artifacts + `.sig`, and the per-target `.json` manifests. A hyphenated
   tag (e.g. `vX.Y.Z-rc1`) is published as a pre-release, so the
   `releases/latest/download/` alias the updater queries skips it.
5. Installed apps on the previous version see the update on next launch.

**Validate first.** The release pipeline only runs on a tag and can't be
exercised by normal CI. Push a pre-release tag (e.g. `vX.Y.Z-rc1`) and confirm
all three jobs upload their bundle + `.sig` + manifest before tagging the real
release. Because hyphenated tags are marked pre-release, an RC never becomes the
`latest` the updater serves.

> **Windows note:** the Windows release builds the editor bundles on an Ubuntu
> job and downloads them for the native build, because the vendored Univer fork
> doesn't compile on Windows (`ERR_UNSUPPORTED_ESM_URL_SCHEME`). See
> `release-windows.yml`.
