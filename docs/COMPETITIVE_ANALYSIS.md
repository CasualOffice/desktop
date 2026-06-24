# Competitive Analysis — Casual Office

Decision-oriented analysis of where Casual Office sits against the
incumbent office suites, what it wins on today, where it loses, and the
roadmap that fits its thesis. Grounded in the current repo
(`CLAUDE.md`, `docs/ARCHITECTURE.md`, `apps/shell/`, the two editor forks).

---

## 1. Positioning

> **Casual Office is a privacy-first, local-only desktop editor for
> everyday `.docx` / `.xlsx` work — no account, no cloud, no telemetry,
> no database. Your files stay on your disk; the app reads and writes
> them through native OS dialogs and nothing else.**

Concretely, from the code:

- **Single-user, local-only.** The Rust core is stateless beyond per-user
  JSON in `~/.config/live.schnsrw.casualoffice/` (`profile/settings/recent`).
  No auth, no network sync, no DB. Collab is compiled out
  (`__COLLAB_BUILD__` is false; the collab UI is dead code — see
  `docs/ARCHITECTURE.md` §"What's intentionally out").
- **Native file model.** Save writes back to the path the document was
  opened with via Tauri commands (`save_document` /
  `begin_save_document` → `write_save_chunk` → `commit_save_document`).
  No browser `<a download>` flow. One OS window per document, like native
  Word/Excel.
- **Small and self-contained.** ~15–16 MB binary on Linux (system webview;
  it does not ship Chromium). Cross-OS by design — Linux (WebKitGTK 4.1),
  Windows (WebView2), macOS (WKWebView) share one codebase; release
  pipelines for all three exist (`.github/workflows/release-{linux,macos,windows}.yml`).
- **Open source.** Apache-2.0 shell; docx editor MIT (fork of
  `eigenpal/docx-editor`); sheets editor Univer-OSS Apache-2.0.

**Who it's for:** people who want to open, edit, and save Office files on
their own machine without signing into anything or sending bytes anywhere
— privacy-conscious users, air-gapped / regulated environments, people on
slow or no connectivity, and OSS purists who reject account-gated suites.

**Who it's *not* for (today):** teams needing real-time co-editing,
power users who depend on pivot tables / advanced charting / mail-merge /
macros, and anyone needing pixel-perfect Word/Excel print fidelity.

---

## 2. Competitor matrix

Legend: ● full / strong · ◐ partial / caveated · ○ none / weak.
"Local-only / privacy" = runs and stores entirely on-device with no
account and no mandatory phone-home.

| Dimension | **Casual Office** | MS 365 (desktop) | Google Docs/Sheets | LibreOffice | OnlyOffice Desktop | Collabora Office | Apple iWork | SoftMaker / WPS |
|---|---|---|---|---|---|---|---|---|
| License / cost | **OSS, free** (Apache-2.0 / MIT) | Paid subscription | Free (ad/data-funded) | OSS, free (MPL/LGPL) | OSS core, free; paid tiers | OSS-derived; paid support | Free w/ Apple HW | Freemium / paid |
| Offline | **● full** | ◐ (sign-in nudges, online features) | ○ (browser; limited offline) | ● full | ● full | ● full | ● full | ● full |
| Local-only / privacy (no account, no phone-home) | **● full** | ○ (account, telemetry) | ○ (cloud-native) | ● full | ◐ (telemetry off by default; portals optional) | ◐ | ◐ (iCloud-leaning) | ◐ (telemetry / upsell) |
| Telemetry | **● none** | ○ heavy | ○ heavy | ◐ opt-in/minimal | ◐ | ◐ | ◐ | ◐ |
| Account required | **● no** | ◐ (effectively yes) | ● yes | ● no | ● no | ◐ | ◐ | ◐ |
| `.docx` / `.xlsx` fidelity | **◐ functional** | ● native (reference) | ◐ (good, import quirks) | ◐ good | ● very good | ● very good | ◐ (export quirks) | ● good |
| Real-time collaboration | **○ none (by design)** | ● | ● (best-in-class) | ○ (none built-in) | ● | ● | ◐ (iCloud) | ◐ |
| Platform coverage | **◐ Linux shipping; macOS/Win pipelines exist; no mobile** | ● desktop+web+mobile | ● web+mobile | ● desktop (no first-party mobile) | ● desktop+mobile | ● desktop+mobile | ◐ Apple-only | ● desktop+mobile |
| Extensibility (plugins/macros) | **○ none** | ● VBA/add-ins | ◐ Apps Script | ● macros/extensions | ● plugins/macros | ● | ◐ | ◐ |
| Footprint / install size | **● ~15–16 MB** | ○ multi-GB | n/a (browser) | ◐ ~300+ MB | ◐ ~250+ MB | ◐ large | ◐ | ◐ |
| Format breadth | ◐ docx, xlsx, xlsm, ods, csv, tsv, txt, md | ● very broad | ◐ | ● very broad (incl. odt/odp) | ● broad | ● broad | ◐ | ● broad |

Notes on Casual Office cells, verified against the repo:

- **Format breadth** — `tauri.conf.json` declares file associations for
  `.docx`, `.xlsx`, `.xlsm`, `.ods`, `.csv`, `.tsv`, `.txt`,
  `.md`/`.markdown`. `.odt` is explicitly out of scope until the docx fork
  gains an OpenDocument Text parser (`docs/ARCHITECTURE.md`).
- **Collaboration "○ by design"** — not a gap of neglect; it is a
  positioning choice. The forks *have* Hocuspocus/Yjs pipelines upstream;
  Casual Office compiles them out.
- **Platform "◐"** — the Linux release binary is green; macOS/Windows
  release workflows are committed but builds are not yet validated/published.
  No mobile target exists.

---

## 3. Where we win / where we lose **today**

### Wins

| Win | Why it's real (repo evidence) |
|---|---|
| **Privacy / no account / no telemetry** | Stateless Rust core, no network code in the save/load path, collab compiled out. This is the single sharpest differentiator vs MS 365 and Google. |
| **Tiny footprint, single binary** | ~15–16 MB on Linux; uses the system webview instead of bundling Chromium. ~20× smaller than LibreOffice/OnlyOffice installs. |
| **File-format-native save** | Save overwrites the original path; atomic temp-file + rename commit (`begin/write/commit_save_document` in `lib.rs`). No "download a copy" footgun. |
| **OSS, permissive license** | Apache-2.0 shell + MIT docx + Apache-2.0 sheets. No copyleft entanglement; CI denies AGPL/GPL drift (`ci.yml` `dependency-review` `deny-licenses`). |
| **Genuinely offline** | Office substitute fonts bundled on-disk (Inter, Material Symbols, plus metric-compatible Liberation/Carlito/Caladea under `dist/docx/`), so layout is deterministic with zero network. |
| **Per-document isolation** | One webview process per document — a heavy `.xlsx` can't freeze your `.docx` window. |

### Losses

| Loss | Severity | Detail |
|---|---|---|
| **`.docx` / `.xlsx` fidelity gaps** | High | The forks are functional, not Word/Excel-faithful. Complex layouts, advanced number formatting, and round-trip edge cases will drift. MS 365 is the fidelity reference; we are not close. |
| **No charts / pivots maturity** | High | Univer OSS covers grid + formulas; pivot tables and rich charting are weak-to-absent compared to Excel/OnlyOffice. |
| **No real-time collaboration** | Medium | Deliberate, but it is still a reason buyers pick Google/OnlyOffice/M365. |
| **No mobile, limited platform validation** | Medium | Linux only is shipping; macOS/Windows pipelines exist but are unproven; no mobile at all. |
| **Fewer features overall** | Medium | No print/print-preview, no spell-check, no templates, no macros/add-ins, no PDF export (see `docs/UX-AUDIT.md`). |
| **Unsigned builds** | Medium | macOS builds ship unsigned ("right-click → Open" Gatekeeper bypass — `release-macos.yml`); no Windows code-signing. Hurts trust and install conversion. |

---

## 4. What more we can offer — roadmap that fits the thesis

Everything here is filtered through one rule: **it must not break
local-only/privacy.** Anything requiring a cloud account is off-thesis.
Effort is rough (S ≤ 1 wk, M ≈ 2–4 wk, L ≈ 1–2 mo, XL > 2 mo).

### Now (next release — sharpen the core promise)

| Differentiator | Effort | Rationale |
|---|---|---|
| **PDF export** (local, no service) | M | Most-requested missing primitive; pure-local, on-thesis. Strong "I can finish my work here" signal. |
| **Code-signing + notarization** (macOS/Windows) | M | Removes the biggest install-trust barrier. Cost is the Apple Developer + an OV/EV cert, not engineering. Today's builds are unsigned. |
| **Deterministic offline fonts** | **Done** | Office-substitute fonts bundled on disk; layout is reproducible without network. Lean into this as a marketing point. |
| **Save-path hardening surfaced to users** | S | Atomic commit + unsaved-close guard exist (`lib.rs`); add a visible "Saved/Modified" indicator so users *trust* it (UX-AUDIT P1). |

### Next (build the moat — privacy-native versions of cloud features)

| Differentiator | Effort | Rationale |
|---|---|---|
| **Local-only AI** (on-device models for summarize / rewrite / formula help) | L | This is the killer differentiator: the cloud suites send your document to a server to do AI. We can do it *on the machine*. Bundle a small local model or call a user-supplied local endpoint (Ollama-style); never a hosted API by default. |
| **LAN collaboration without a cloud** | L | Peer-to-peer Yjs over the local network (mDNS discovery) reuses the forks' existing Yjs pipelines but keeps bytes off the internet. "Co-edit in the same room, nothing leaves the building." |
| **Templates gallery (bundled, local)** | M | Closes a real UX gap (UX-AUDIT P1) without any cloud store. |
| **Plugin SDK** | L | A sandboxed, local extension API turns the two-editor shell into a platform; on-thesis if plugins run with explicit, scoped permissions and no implicit network. |

### Later (breadth + leadership)

| Differentiator | Effort | Rationale |
|---|---|---|
| **End-to-end-encrypted *optional* sync** | XL | Only as an opt-in, BYO-storage, zero-knowledge feature. Default stays local. Lets us answer "but I have two machines" without becoming a cloud product. |
| **Format-support breadth** (`.odt`, `.pptx`, richer `.ods`) | L–XL | Gated on the forks gaining parsers; `.odt` is already the named next target. |
| **Accessibility leadership** | M–L | A full WCAG pass + screen-reader + keyboard-only + high-contrast certification. The incumbents are mediocre here; "the accessible office suite" is a defensible niche. a11y roles were recently added to the launcher; finish the editors. |
| **Crash recovery / draft journal** | M | Local autosave-to-tmp recovery on next launch (UX-AUDIT P1). Pure-local, high trust value. |

---

## 5. Risks & threats

| Risk | Likelihood | Impact | Notes / mitigation |
|---|---|---|---|
| **Univer Pro licensing boundary** | Med | High | The sheets editor is Univer **OSS** (Apache-2.0). Advanced features (some pivots/charts) live behind Univer Pro's commercial license. Building toward Excel-parity may push into Pro territory — must stay strictly on the OSS surface or accept a license cost. |
| **`.docx` / `.xlsx` fidelity** | High | High | OOXML is enormous; the forks will never match Word/Excel on every edge case. Round-trip data loss on complex files is the most damaging failure mode. Mitigation: a fidelity test corpus + visible "this file uses features we can't fully render" warnings. |
| **Maintaining two upstream forks** | High | Med | `docx/` and `sheets/` are separate repos pulled in-tree, each with its own toolchain (Bun vs pnpm) and `CLAUDE.md`. Upstream drift + our desk-bridge patches are a permanent maintenance tax. Keep the patch surface minimal (today: just the bootstrap + a few gated branches). |
| **Code-signing / notarization cost** | High (cost) | Med | Unsigned macOS/Windows builds suppress installs and trip SmartScreen/Gatekeeper. Recurring cert + Apple Developer cost; non-trivial but bounded. |
| **No telemetry = blind to bugs** | Med | Med | The privacy stance means no crash analytics. Mitigation: a *local* crash-log surface the user can voluntarily attach to an issue (Rust panics currently go to stderr only — UX-AUDIT P2). |
| **Single-maintainer / bus factor** | Med | Med | Two forks + a shell + three release pipelines is a lot of surface for a small team. CI gates (CodeQL, cargo-audit, dependency-review) reduce silent regressions but not staffing risk. |

---

### Bottom line

Casual Office wins decisively on **privacy, footprint, and openness** and
loses on **fidelity, feature breadth, and platform/mobile reach**. The
defensible strategy is *not* to chase Excel feature-for-feature (that road
runs into Univer Pro and OOXML fidelity walls) but to own the
**"private, on-device, no-account office suite"** position — and to make
the cloud suites' headline features (AI, collaboration, sync) work
*locally* in ways they structurally cannot match.
