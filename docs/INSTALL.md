# Installing Casual Office on Linux

Two installer formats are produced by `cargo tauri build` — pick whichever
matches your distro.

## Build the installer

```bash
cd apps/shell
cargo tauri build
```

Artifacts land in `apps/shell/src-tauri/target/release/bundle/`:

```
bundle/
├── deb/
│   └── Casual Office_0.0.0_amd64.deb
└── appimage/
    └── Casual Office_0.0.0_amd64.AppImage
```

## Install via `.deb` (Ubuntu / Debian / Pop!_OS / Mint)

```bash
sudo apt install \
  ./apps/shell/src-tauri/target/release/bundle/deb/"Casual Office_0.0.0_amd64.deb"
```

This installs:
- The binary at `/usr/bin/deskapp-shell` (the package's hard-coded executable name)
- The desktop entry at `/usr/share/applications/Casual Office.desktop`
- Icons at `/usr/share/icons/hicolor/<size>/apps/casual-office.png`
- MIME-type associations declared in `tauri.conf.json` for `.docx`, `.xlsx`,
  and `.xlsm`

Launch via the application launcher (search "Casual Office") or from a
terminal:

```bash
casual-office          # if /usr/local/bin is on PATH
# or
/usr/bin/deskapp-shell
```

## Install via `.AppImage` (any glibc Linux)

```bash
chmod +x "Casual Office_0.0.0_amd64.AppImage"
./"Casual Office_0.0.0_amd64.AppImage"
```

The `.AppImage` is fully self-contained — no system install. To register it
with the desktop (so it shows up in your launcher and accepts double-click
on `.docx`/`.xlsx`), use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher)
or copy the `.AppImage` into `~/.local/bin/` and `xdg-desktop-menu install`
the bundled `.desktop` file.

## Make Casual Office the default for `.docx`, `.xlsx`, `.csv`, `.tsv`

After install, your file manager will list **Casual Office** under
"Open With…" for those extensions. To set it as the **default**:

### Per-file (GUI)

1. Right-click the file in your file manager (Files / Nautilus / Dolphin)
2. **Open With Other Application…**
3. Pick **Casual Office** → tick **Always use this for this kind of file** →
   *Open*

### Bulk (CLI) — set defaults for the whole MIME family

Casual Office's desktop entry is `live.schnsrw.casualoffice.desktop`
(installed by the `.deb`). Set it as the default with `xdg-mime`:

```bash
# Word documents
xdg-mime default live.schnsrw.casualoffice.desktop \
  application/vnd.openxmlformats-officedocument.wordprocessingml.document

# Excel workbooks
xdg-mime default live.schnsrw.casualoffice.desktop \
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
xdg-mime default live.schnsrw.casualoffice.desktop \
  application/vnd.ms-excel.sheet.macroEnabled.12   # .xlsm

# OpenDocument Spreadsheet
xdg-mime default live.schnsrw.casualoffice.desktop \
  application/vnd.oasis.opendocument.spreadsheet

# CSV / TSV (text-based)
xdg-mime default live.schnsrw.casualoffice.desktop text/csv
xdg-mime default live.schnsrw.casualoffice.desktop text/tab-separated-values
```

Verify:

```bash
xdg-mime query default \
  application/vnd.openxmlformats-officedocument.wordprocessingml.document
# → live.schnsrw.casualoffice.desktop
```

### Note on `.csv` / `.tsv`

The `tauri.conf.json` `fileAssociations` block currently declares `.docx`,
`.xlsx`, `.xlsm`. CSV / TSV / ODS aren't declared as file-association
targets — the OS won't list Casual Office in **Open With** for them by
default. Two ways around it:

1. **Set defaults with `xdg-mime` anyway** (shown above) — the launcher
   handles the file via its CLI argv path; the desktop entry's `Exec=`
   takes any path. xdg-mime makes it the default even though it isn't
   in the `.desktop`'s `MimeType=` list.
2. **Add to `MimeType=`** by editing `~/.local/share/applications/live.schnsrw.casualoffice.desktop`
   (after install) — append `text/csv;text/tab-separated-values;application/vnd.oasis.opendocument.spreadsheet;`
   to the `MimeType=` line and run `update-desktop-database ~/.local/share/applications/`.

The next round of `fileAssociations` updates in `tauri.conf.json` should
include these so the build does it for you.

## Single-instance behavior

Casual Office uses the `tauri-plugin-single-instance` plugin. Double-clicking
a `.docx` while the app is already running:

- Sends the new file path to the running instance
- The running launcher opens a new document window for that file
- The duplicate launcher process exits immediately
- The original launcher comes to focus

So you can keep one Casual Office launcher pinned and just double-click
files in your file manager — they all route through the same process.

## Uninstall

```bash
sudo apt remove casual-office
```

To purge per-user state (profile, recent files, settings, profile picture):

```bash
rm -rf ~/.config/live.schnsrw.casualoffice/
```
