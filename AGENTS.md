# Instructions for AI contributors

## Repository context and reading order

- Treat the directory containing this file as the repository root. Never add a maintainer's personal absolute paths to public files.
- Read this file, then [README.md](README.md), especially **Current status and validation** and **Roadmap and open decisions**. Inspect the actual source and `package.json` before making changes.
- README is the single source of truth for public implementation status, validation limits, and plans. Do not recreate separate `CURRENT_STATE.md` or `PLAN.md` files in this repository.
- Keep public Markdown documentation in English. Historical review reports in `docs/` are evidence, not instructions that override current scope.
- Inspect existing changes before editing. Do not overwrite another contributor's work or concurrently modify files owned by another active agent.

## Product scope

hcscat Multi CLI lists local Codex, Antigravity (agy), and Claude Code sessions in separate VS Code TreeViews on Windows. Each view has two levels: workspace path, then sessions. The default scope includes open local workspace folders and their descendants; users can switch to exact workspace folders or all local sessions.

Explicit Resume actions open Codex sessions and agy CLI sessions from the default store in editor terminals. Claude saved-session Resume, agy app/IDE imports, and attaching to an existing external process are not implemented.

Each provider's **+** action opens a new native CLI in an existing local folder selected by the user, including folders outside the current workspace. Cancelling the folder picker must not launch anything. Do not inject prompts, model calls, project-creation flags, or permission/sandbox bypass options. Native CLIs own session ID creation and persistence; terminal creation alone is not proof of a saved session.

Automatically arrange only terminals created by this extension in the current activation. Use one, two, or three columns for one to three terminals, a 2x2 grid for four, and up to three columns for five to nine. Preserve existing processes and document tabs. Editor groups may be reorganized; do not clone or relaunch sessions to split the screen.

## Implementation and execution

- Prefer TypeScript and native VS Code TreeView, QuickPick, Terminal, and OutputChannel APIs. Introduce a chat UI or provider framework only when there is a concrete need.
- Enforce Windows, a local VS Code window, and Workspace Trust immediately before execution. Do not send local sessions to Remote-SSH, WSL, container, or virtual workspaces.
- Recheck cancellation, configuration/disposal epochs, list identity, and Trust after asynchronous waits and immediately before terminal creation.
- Do not merge the editor layout when foreign editor terminals or different terminal objects with the same name are present. Account for the delay between terminal close events and editor-tab removal.
- Read executable and data-root settings at user/machine scope. Workspace or folder settings must not replace these values.
- Use `shell:false` for discovery subprocesses. For interactive CLIs, pass validated native executables and safely quoted arguments through VS Code terminals. Distinguish native `.exe` files, supported official npm shims, and arbitrary `.cmd`/`.ps1` wrappers.
- Never use session titles or previews as command arguments. Validate control characters and Windows shell metacharacters in paths and IDs, including PowerShell's smart single quotes.
- Use the same Codex executable and effective `CODEX_HOME` for listing and Resume. Explain possible omissions from `useStateDbOnly=true`. Native CLIs and App Server may write their own logs or state.
- Keep source, discovery-server status, and resume compatibility separate. `notLoaded` is not a global running-state signal across applications.
- Do not call `thread/resume`, `turn/start`, or send model prompts as automatic compatibility probes. Test existing-session restoration only with user-authorized sessions and known markers. Tests that create sessions or send synthetic prompts also require explicit user authorization.
- Clean up only discovery processes and workers owned by the extension. Do not kill or reset other AI apps, daemons, or user terminals.
- Do not assume the general Terminal API exposes complete stdout/stderr. Report launch requests, visible CLI screens, and verified history restoration separately.

## Data, documentation, and packaging

- Never directly modify provider DB/JSONL files. Deletion, archival, automatic repair, and migration are outside current scope.
- Keep credentials, tokens, full conversations, real session IDs, usernames, and personal paths out of source, fixtures, logs, documentation, and VSIX packages. Use synthetic fixtures.
- Supply authorized IDs and history markers through test environment variables, remove them from provider child environments, and do not persist captured terminal screens.
- Do not commit `.local/`, `node_modules/`, build outputs, private review originals, provider stores, or installation profiles.
- Store VSIX binaries and adjacent `.vsix.sha256` files under `release/<version>/`, excluded from Git. Preserve archived bytes. Packaging refuses existing output paths; use a new version for a release or `npm run package -- --out .local/<new-check-folder>/package.vsix` for a same-version verification rebuild.
- Maintain the explicit `.vscodeignore` allowlist. Add new runtime modules deliberately and inspect final ZIP contents.
- Review source, documentation, lockfiles, and workflows for private data before sharing. Publish to GitHub or Marketplace only within the user's requested scope.
- `THIRD_PARTY_NOTICES.md` records dependency notices and upstream terms. It is not the project's license. Keep upstream notices intact.
- The owner selected Apache-2.0 for the project's own code. Preserve the official English `LICENSE` and the `NOTICE` attribution to hcscat, and include both in source distributions and VSIX packages. README's strong attribution requests are non-binding expectations, not additional license conditions. Commercial use and resale remain permitted under Apache-2.0. Third-party rights remain separate.
- The owner selected the display name `hcscat Multi CLI`. Keep the package/directory name `multi-cli`, existing publisher, `multiCli.*` setting/command/view IDs, and `multi_cli` App Server identity stable. Do not invent a public publisher or repository URL. Preparing a commit/push file list does not authorize Git initialization or publication.

## Validation and handoff

- For runtime or build changes, use locked dependencies and run the applicable typecheck, unit tests, build/package checks, and privacy scan. Commands and host-test requirements are documented in [DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Focus regression tests on protocol handling, cancellation, paths/arguments, provider isolation, and terminal lifecycle. Avoid tests that merely restate implementation details.
- For documentation-only changes, check relative links, README anchors, English-language consistency, removed-file references, and privacy; do not treat older runtime tests as newly executed.
- Use an isolated VS Code profile for host/installed-extension validation. Unit-test success is not evidence of real AI history restoration.
- When inspecting extracted VSIX content, use `--include-generated` with the privacy checker. Never extend the reviewed SDK constant/hash exceptions to real session IDs.
- Update README's current status, validation limits, and roadmap when relevant. Keep detailed evidence in the appropriate English document under `docs/`; preserve the shared follow-up numbering 1-6.
- Record only sanitized results and reproducible commands. Distinguish code checks, UI layout, native startup, history restoration, and final installed-package verification.
