# hcscat Multi CLI

Browse local Codex, Antigravity (agy), and Claude Code sessions in VS Code, then work in native CLI terminals in the editor area. hcscat Multi CLI runs on Windows and does not depend on Orca or herdr.

**Version: 0.5.3 · Local Windows x64 · VS Code 1.140+**

Source repository: [hcscat/hcscat-multi-cli](https://github.com/hcscat/hcscat-multi-cli). Report bugs and feature requests through [GitHub Issues](https://github.com/hcscat/hcscat-multi-cli/issues).

This README contains the public product overview, current implementation status, validation results, and roadmap. The extension's current UI messages are primarily Korean; English documentation does not imply that the UI has been localized.

- [Features](#features)
- [Installation and usage](#installation-and-usage)
- [Editor terminals and automatic layout](#editor-terminals-and-automatic-layout)
- [Discovery and Resume limitations](#discovery-and-resume-limitations)
- [Settings and diagnostics](#settings-and-diagnostics)
- [Development](#development)
- [Current status and validation](#current-status-and-validation)
- [Roadmap and open decisions](#roadmap-and-open-decisions)
- [License and third-party notices](#license-and-third-party-notices)

## Features

| Provider | Session discovery | Resume a saved session | New CLI in a selected folder |
|---|---|---|---|
| Codex | Local App Server database index | Supported | Supported |
| Antigravity (agy) | CLI/app/IDE summaries and recent-session cache | CLI sessions in the default store | Supported |
| Claude Code | Official Agent SDK saved sessions and CLI execution records | Not implemented | Supported |

Each provider has its own TreeView, refresh, search, scope, cancellation, and error state. Search applies to sessions already loaded. Session rows and terminal tabs use the ChatGPT/OpenAI Blossom for Codex, Google's gradient G for Antigravity, and the official Claude Spark for Claude Code. Codex switches between black and white marks with the theme; Google and Claude retain their official colors. The agy marker identifies the provider, not the model used in an individual session. Native TreeView headings show provider names because they do not support inline logo images. All assets are packaged for offline use; see [third-party notices](THIRD_PARTY_NOTICES.md#provider-marks) for sources and ownership.

Views have two levels: workspace path, then session title. Paths are not repeated beside session titles. These paths and titles are synthetic examples:

```text
Codex
  C:\example\project-a
    Feature implementation
    Test review
Antigravity (agy)
  C:\example\project-a\tools
    Documentation review
Claude Code
  C:\example\project-b
    Source review
```

The default scope is **open local workspace folders and their descendants**. Each provider can switch to **exact workspace folders** or **all local sessions**. Multi-root workspaces include every open local folder. With no local folder open, the view explains the fallback and shows all local sessions. Records without a known path are available in the all-local scope.

A session associated with multiple paths can appear under each matching path, so folder counts may add up to more than the unique session count. Workspace changes refresh visible views; hidden views invalidate their previous state and load the new scope when opened. Malformed individual Codex or Claude execution records are skipped with a count while valid records remain available. An invalid response structure is reported as a query error.

## Installation and usage

Requirements: Windows x64, VS Code 1.140 or later, and the native CLI plus authentication/configuration for each provider you want to use. Execution requires a trusted local workspace. Codex discovery requires CLI 0.153.4 or later, but compatibility with every later release is not guaranteed.

1. Build a VSIX and SHA-256 sidecar under `release/<version>/` with `npm run package`, following [DEVELOPMENT.md](docs/DEVELOPMENT.md). Existing output files are never overwritten; use a new version or a separate `--out` path for a verification rebuild.
2. Run **Extensions: Install from VSIX...** in VS Code, select the package, and reload the window.
3. Open **hcscat Multi CLI** in the Activity Bar and expand a workspace path under a provider.
4. Select a session to inspect its details or copy its ID. Use **Resume** for Codex or a supported agy CLI session.
5. To start a new session, select **+** in the provider view and choose an existing local folder. The folder may be outside the current VS Code workspace.

The **+** action opens the native CLI's new-session screen. The extension does not send a prompt or select a model. Follow the CLI's login, folder-trust, and other startup steps. A session ID may not be saved until the first interaction; refresh the list after it is saved. Sessions created outside the current scope may require switching to **all local sessions**.

## Editor terminals and automatic layout

Resume, new CLI sessions, and the Codex session picker open in the editor area rather than the bottom panel. The extension arranges terminals it created in the current window:

| Terminal count | Layout |
|---|---|
| 1 | One group |
| 2 | Two columns |
| 3 | Three columns |
| 4 | 2x2 grid |
| 5-9 | Up to three columns, with the final column sized for the remaining terminals |

Rearrangement moves existing processes. Repeated Resume of the same saved session reuses its terminal; the notification offers a separate new terminal if needed. **+** always opens a fresh CLI. Closing a managed terminal rearranges the remaining terminals. The limit is nine.

Document tabs are preserved, although editor groups may merge or move. Other extensions' terminals and terminals restored after a window reload are not automatically managed. After the last managed terminal closes, the current document layout remains in place.

If another editor terminal is present, new automatic layouts are blocked to avoid moving it indirectly. Move that terminal to the bottom panel or close it before opening another managed terminal. A future alternative without automatic layout is under consideration.

## Discovery and Resume limitations

**Codex:** Listing and Resume use the same native executable and effective `CODEX_HOME`. Discovery reads the non-archived database index with `useStateDbOnly=true`, so unindexed records may be omitted. The full CLI picker runs `codex resume --all` and can show a different set of sessions. Desktop origin alone does not establish or rule out CLI compatibility.

**agy:** Resume validates a CLI-origin UUID in the default `.gemini` store and checks for a nonempty source conversation file immediately before running `agy --conversation <ID>`. App/IDE records are not direct CLI Resume targets. Custom data roots and unverified data-root environment overrides support listing only. Deletion after the file check can still cause a native Resume failure.

Antigravity's summary schema is private and can change. Version differences, locks, or missing columns may cause partial discovery failures. Metadata queries do not modify DB records, but SQLite read-only connections can create or update `-wal`/`-shm` sidecars. Synthetic byte-preservation tests apply to the main DB file.

**Claude:** Saved-session metadata and CLI execution records are distinct sources. Neither provides a guarantee of complete history or global live state. Missing paths are not guessed. Saved-session Resume is not implemented.

Codex descendant filtering reads metadata pages and compares directory boundaries. Each operation loads up to 50 new matching records or 20 pages; **Load more** continues from the remaining cursor. The total scan limit is 10,000 records, including malformed or duplicate Codex entries. Claude and agy catalogs are also capped at 10,000 records.

Source, query-server status, and terminal creation are not proof of successful history restoration. Inspect the native CLI screen for the restored conversation or errors. Resume reopens saved state; it does not attach to another terminal process.

Remote-SSH, WSL, containers, macOS, virtual workspaces, session deletion/archival, automatic repair/migration, and a custom chat UI are outside current support.

## Settings and diagnostics

Executable and data-root settings use user/machine scope. Workspace and folder settings cannot replace them.

| Setting | Purpose and default |
|---|---|
| `multiCli.executablePath` | Native Codex executable or a supported official npm shim; otherwise search PATH |
| `multiCli.codexHome` | Explicit Codex store; otherwise `CODEX_HOME` or the user's default `.codex` |
| `multiCli.antigravityExecutablePath` | Native `agy.exe`; otherwise search PATH and the standard user installation location |
| `multiCli.antigravityDataRoot` | Parent directory for catalog discovery; default: the user's `.gemini` |
| `multiCli.claudeExecutablePath` | Native `claude.exe`; otherwise search PATH and the standard user installation location |
| `multiCli.claudeConfigDir` | Explicit Claude configuration directory; otherwise `CLAUDE_CONFIG_DIR` or the user's default `.claude` |

An invalid explicit setting is not silently replaced with a different executable or store. Diagnostics report scope and aggregate results without recording full conversations, credentials, raw provider errors, or personal paths in the extension's Output Channel. App Server and native CLIs may still write their own logs and state.

When a default store does not yet exist, a new native CLI may initialize it. The extension does not create the store itself and rejects nonexistent explicitly configured stores. Pending launches are cancelled when their configuration becomes stale.

## Development

Use Node.js 22.13 or later and npm. The Windows CI workflow uses Node.js 22.

```powershell
npm ci
npm run typecheck
npm test
npm run check:privacy
npm run package
```

The source snapshot can be built independently. Generated outputs, installation profiles, provider data, and credentials are excluded. CI runs synthetic tests and builds a VSIX artifact; it does not invoke real AI accounts or automatically publish a GitHub Release or Marketplace extension.

- [Architecture and source map](docs/ARCHITECTURE.md)
- [Development and testing](docs/DEVELOPMENT.md)
- [Package review and release procedure](docs/RELEASE.md)
- [Public-source privacy review and commit preparation](docs/PUBLICATION_READINESS.md)
- [AI contributor instructions](AGENTS.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Current status and validation

**First public source publication (2026-10-05):** the initial source commit [`edbdd53`](https://github.com/hcscat/hcscat-multi-cli/commit/edbdd53b64a9842ff3a46aed07d63739e71ef7c4) was pushed to `main`. Its [Windows CI run](https://github.com/hcscat/hcscat-multi-cli/actions/runs/37268045547) passed locked dependency installation, typechecking, 70 synthetic tests, source privacy review, VSIX packaging, and artifact upload. The committed source contains 64 files; the local source scan found zero privacy issues, and ten English Markdown files with 54 relative links/anchors passed validation. A separate locally built verification VSIX passed inspection of all 28 entries. CI artifacts are temporary build outputs; GitHub Release and Marketplace publication remain pending. Live AI history restoration was not repeated for this source publication.

**Version 0.5.3 (2026-10-05):** the selected display name is **hcscat Multi CLI**. The extension listing, Activity Bar, 21 command titles, settings heading, Output Channel, App Server display title, development launch label, and current attribution documents use the new name. Package/publisher identifiers, commands, configuration keys, views, and the App Server identity remain stable. These identifiers and support declarations were compared with the preceding package manifest. No session-handling behavior changed.

Typecheck, all 70 tests, and packaging passed. The final VSIX contains 28 entries and passes the privacy scan including generated runtime files. Its display name, license/notice content, README, 13 runtime files, and checksum were verified. The new local artifact is `multi-cli-win32-x64-0.5.3.vsix`, **556,466 bytes**, SHA-256 `2f7a2117cf94b97522998b442b4de8e5537fe33f0f2313b846bf0a0a273de3dc`. It was built with the local Korean README; building this English source snapshot produces a separately verifiable artifact. All eight older archives were preserved. This update did not install the extension, repeat live AI restoration/UI tests, or publish externally.

The public snapshot contains **63 files** with no sensitive-data findings in the final scan. An independent review also examined credentials and private paths, session data, registry URLs, CI permissions, SVG active content, and embedded image metadata. Ten English Markdown documents and 54 relative links/anchors passed validation. The commit-file inventory and optional additions are in [publication readiness](docs/PUBLICATION_READINESS.md). No mandatory source file is missing for a Git commit; the snapshot is not yet a Git repository.

**Latest licensing update (2026-10-04):** the owner selected Apache-2.0 and original-author attribution to hcscat. LICENSE and NOTICE are included in the source snapshot and VSIX allowlist, and packaging no longer skips the license-file check. Typecheck and all 70 tests passed. A separate same-version verification VSIX passed checks of its 28 entries, license/notice bytes, manifest author/license, VSIX license reference, and SHA-256 sidecar; the package privacy scan found no issues. The source snapshot has 62 files with no privacy findings, and nine English Markdown files with 49 valid relative links/anchors. The official license text is unchanged. All eight historical VSIX archives retain their original hashes. No new runtime behavior, installation, live-provider test, or external publication was part of this update. The extension name and version were unchanged at that stage; version 0.5.3 adopts the selected name above.

Version **0.5.2** replaces the custom provider glyphs with the marks described above and removes the old Unicode glyphs from view headings. It preserves the v0.5.1 session and terminal behavior. The existing v0.5.1 fixes include PowerShell smart-quote escaping, host-environment cleanup, per-record error isolation, and lazy reloads for hidden views. That review also removed redundant page normalization/store hashing, tied App Server client metadata to the manifest version, clarified SQLite sidecar behavior, and upgraded the packaging tool to `@vscode/vsce` 4.0.0 to remove a vulnerable transitive dependency path.

The table below records the v0.5.1 validation runs from 2026-10-03 and 2026-10-04. These history-restoration and live-provider results were not repeated for the icon-only update.

For **v0.5.2** (2026-10-04), typecheck and all 70 automated tests passed. The six packaged icon variants were visually inspected at 16px and 40px on light and dark backgrounds in a Chromium-based browser. This was an asset-rendering preview, not a new live VS Code screenshot or a history-restoration test. Claude's former custom eight-spoke glyph was replaced with the official irregular Spark; its path and color match the press-kit asset. The Google SVG wrappers contain the unchanged official PNG, so they should not be described as all-vector artwork.

The v0.5.2 build and packaging checks passed: all 26 VSIX entries passed the privacy scan, and all 13 runtime JS/MJS files plus seven SVG assets matched the current build/source byte-for-byte. The public snapshot has 59 files and passed its privacy scan; nine English Markdown files and 42 relative links/anchors passed validation. SVG parsing and passive-content checks passed, as did the original Google PNG hash and Claude path/color comparisons. No default-profile installation was performed for this update.

Current archived local artifact: **`release/0.5.2/multi-cli-win32-x64-0.5.2.vsix`**, **550,936 bytes**, SHA-256 **`5436b0eb01d521405db58df49073049be3c91fc633af7bf18bfdc98cbd74d663`**. This identifies the preserved local package; rebuilding with newer documentation or the independent public README produces a different package hash. Release binaries are excluded from this source snapshot and Git.

The subsequent release-directory update preserved all eight local VSIX binaries (0.1.0 through 0.5.2) byte-for-byte and added SHA-256 sidecars. Packaging, installed-test lookup, and CI artifact paths now use `release/<version>/`. Typecheck and all 70 tests passed again. Default and alternate package outputs, checksum validation, overwrite refusal, and rejection of output paths outside the project were checked locally. Both verification packages passed privacy scans of all 26 entries. That snapshot contained 60 files and passed its privacy scan; nine English Markdown files and 42 relative links/anchors passed validation. This update did not repeat live AI restoration, installation, or remote CI, and did not change the runtime version. License selection was still deferred at that stage; the later Apache-2.0 decision is recorded below.

| Area | Verified result | Limits |
|---|---|---|
| TypeScript and automated tests | Typecheck and 70/70 unit/synthetic tests passed | Not a substitute for live CLI verification |
| Windows arguments/environment | Ten native PowerShell cases covered ordinary/smart quotes, preserved arguments, benign injection probes, and environment cleanup | Synthetic executables and inputs |
| Installed v0.5.1 | Provider catalogs/TreeViews, special-character arguments, empty store, Codex picker, and owned-process cleanup passed | Separate test profile, not the default user profile |
| Editor layout | Real Extension Host: 1-9 groups, original PIDs/document tabs preserved, 9-to-8-to-9 reflow, tenth request blocked | Not a visual readability or screenshot review |
| New Codex/agy sessions | Authorized synthetic prompts produced responses and saved records | Codex used a new editor terminal; agy used native print mode |
| Codex/agy Resume | Two independent close/reopen cycles per provider restored known markers; duplicate Resume reused the terminal/PID | Does not establish compatibility for every saved conversation or agy app/IDE record |
| Claude records | A real login-failure record appeared through the official SDK and TreeView | Normal authenticated model response remains unverified |
| Scope filtering | All three providers passed path-to-session grouping, descendant inclusion, unrelated-path exclusion, and exact-folder filtering | Tested with isolated synthetic workspaces |
| Workspace Trust | Installed extension inactive and zero terminals in a genuinely untrusted window; trusted control activated | Revocation through the UI during a pending launch remains unverified |
| Process lifecycle | Final three dispose and three stdin-EOF cycles ended the server and observed `conhost` descendants | No MCP leak reproduced in this listing-only configuration; not a guarantee for all MCP setups |
| Discovery latency | Ten measurements per provider: median Codex 114ms, agy 101ms, Claude 214ms | Current local data volume; no large-store performance guarantee |
| Source/package review | Independent install/build/tests/package passed; 26 VSIX entries and 13 runtime JS/MJS files matched the verified build; dependency audits reported zero vulnerabilities | Historical results, not a perpetual audit claim |

The public snapshot had 61 files at the end of the additional validation run and passed its privacy scan. Public source and extracted packages are scanned separately. SDK namespace/UUID constants have reviewed exceptions limited by bundle path and hash; real session IDs are not exempted.

Earlier validation remains historical evidence:

- **v0.4.0:** 50 tests; real four-process layouts with PID/document preservation; authorized Codex/agy history restoration and simultaneous display.
- **v0.5.0:** 63 tests; independent `npm ci`, typecheck, tests, privacy scan, and packaging; all three native startup screens and three-column layout; authorized Codex/agy history restoration. New persistent IDs and five-to-nine layouts had not yet been verified at that stage. Source privacy scan covered 59 files and package review covered 26 entries. See [SOURCE_REVIEW.md](docs/SOURCE_REVIEW.md).
- **v0.5.1:** 70 tests, the security/stability fixes above, and the subsequent real-session/layout validation. See [REVIEW_0.5.1.md](docs/REVIEW_0.5.1.md) and [FOLLOW_UP.md](docs/FOLLOW_UP.md).

Previously verified local artifacts, **before this English documentation consolidation**:

| Artifact | Size | SHA-256 |
|---|---:|---|
| `multi-cli-win32-x64-0.5.1.vsix` | 321,856 bytes | `6899c3c789111de1de3674ce4d5bbc8f8a722aa106c13cd56435dcd4a2a3472a` |
| `multi-cli-win32-x64-0.5.0.vsix` | 320,841 bytes | `f846c2568303570b8ca505ced440499a3b6913d69b38c906aad53ac957159647` |

Building with updated documentation or repository metadata can change package size and hash even when runtime code is unchanged. Record the actual output of each release build. The owner authorized the first public source push on 2026-10-05. Marketplace publication remains pending. Remote windows, minimum-runtime compatibility across versions, and visual theme/readability reviews need additional coverage.

## Roadmap and open decisions

The implemented goal is local discovery for three providers, explicit Resume for supported saved sessions, and a new native CLI in a user-selected folder. Authentication and provider interaction remain native. The following **1-6** identifiers are the shared follow-up numbering; they are proposals or verification needs, not completed features.

| ID | Open item | Recommended direction |
|---|---|---|
| 1 | Coexist with foreign editor terminals | Offer opening without automatic layout while preserving existing groups |
| 2 | Network and special paths | Separate local disk support from explicitly chosen network access; distinguish UNC, mapped drives, device paths, and valid local extended paths |
| 3 | Titles, commands, and status feedback | Handle direction-control characters, preserve emoji, hide internal palette commands, and explain stale items or pending duplicate launches |
| 4 | Reduce the production API surface | Replace mutable internal-object exports together with the installed-test driver; no new privilege escalation was reproduced |
| 5 | Remaining live verification | Verify Claude after user login and UI Trust revocation during pending execution; this does not add Claude Resume |
| 6 | Publication and third-party terms | Display name, Apache-2.0, and the GitHub repository are selected; select the Marketplace publisher and review bundled SDK distribution terms before binary publication |

Current measurements do not justify urgent runtime/catalog caching. MCP descendant leaks and agy version-output warnings were not reproduced; add targeted changes if concrete evidence appears. Detailed follow-up evidence is in [FOLLOW_UP.md](docs/FOLLOW_UP.md).

Additional feature candidates require a separate scope decision:

- **Claude saved-session Resume:** verify the installed native CLI contract and matching store, then cover failure/cancellation and authorized history restoration.
- **agy app/IDE import:** distinguish direct Resume from import/copy and explain resulting store/ID changes before implementation.
- **Terminal ownership after reload:** validate stable API identifiers; never infer ownership from the tab name alone.
- **Compatibility and visual coverage:** check the minimum supported VS Code/Node SQLite combination, themes, and layout readability. Real five-to-nine layout behavior has already been checked.
- **Other platforms, remote operation, or a custom chat UI:** design only after an explicit request and demonstrated need.

Release work follows [RELEASE.md](docs/RELEASE.md). Roadmap entries do not authorize publication or establish delivery dates.

## License and third-party notices

hcscat Multi CLI was originally developed by **hcscat**. The project's own source code is licensed under the **[Apache License, Version 2.0](LICENSE)**. Commercial use, modification, redistribution, and resale are permitted under its terms. The original source is [hcscat/hcscat-multi-cli](https://github.com/hcscat/hcscat-multi-cli). `multi-cli-local` remains a local packaging publisher; a Marketplace publisher has not been configured. The display name is hcscat Multi CLI. The package name and internal IDs remain unchanged.

These documents serve different purposes:

| Document | Purpose |
|---|---|
| [LICENSE](LICENSE) | Unmodified official Apache-2.0 text for hcscat Multi CLI's own code |
| [NOTICE](NOTICE) | Original-project and author attribution, without additional license conditions |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Dependency attribution, provider mark sources/ownership, upstream terms, and preserved notices; does not license hcscat Multi CLI |

### Redistribution and compliance

This summary does not replace the license. When redistributing, follow Apache-2.0 section 4, including:

- Give recipients a copy of the license.
- Put prominent notices in modified files stating that they were changed.
- Retain applicable copyright, patent, trademark, and attribution notices in distributed derivative source code.
- Carry forward relevant attribution notices from `NOTICE` in a location allowed by section 4(d), such as a distributed notice file, accompanying source/documentation, or an appropriate generated display. Apache-2.0 does not require a credit on every startup screen or sales page.

The patent grant in section 3 covers only contributor-licensable claims necessarily infringed by their contributions alone or combined with the submitted work. Filing patent litigation alleging that this work or an incorporated contribution infringes a patent terminates the patent licenses granted under Apache-2.0 for that work. The grant does not cover every patent a contributor owns. Section 6 does not grant general trademark rights.

Redistribution involves maintaining these files and notices; Apache-2.0 does not generally require permission requests or publication of modified source code. The license's warranty disclaimer and liability limitations also apply.

### Commercial use and attribution expectations

We strongly ask downstream distributors to clearly identify hcscat Multi CLI as the original upstream project and distinguish their own contributions from the original authors' work. We consider deliberately concealing the project's origin or presenting the original work as entirely self-developed unacceptable. Please make this attribution easy to find in your documentation or product information.

**These requests express the authors' expectations and do not add conditions to or modify the Apache License, Version 2.0.**

Suggested attribution wording (replace the bracketed text with accurate information):

> This product includes code from hcscat Multi CLI, originally developed by hcscat and licensed under Apache-2.0. Modifications were made by [distributor].

Including the original repository URL, https://github.com/hcscat/hcscat-multi-cli, is encouraged. This attribution identifies the upstream code; it does not imply that a downstream product is entirely open source or endorsed by the original author.

Third-party terms remain separate. Keep the bundled Claude Agent SDK's upstream README and notices, and review its distribution terms before publication. Provider marks retain their owners' rights and are not relicensed under Apache-2.0. A privacy-policy reference concerns data handling and is not a project software license. See the [official Apache-2.0 text](https://www.apache.org/licenses/LICENSE-2.0) and [Apache licensing FAQ](https://www.apache.org/foundation/license-faq.html).
