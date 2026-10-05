# Development and validation

## Setup and commands

Work from the repository root on Windows x64 with Node.js 22.13 or later and npm. CI uses Node.js 22. Catalog code uses `node:sqlite`; do not assume older Node versions or an API typings version establish Extension Host runtime compatibility.

```powershell
npm ci
npm run typecheck
npm test
npm run check:privacy
npm run package
```

| Command | Purpose |
|---|---|
| `npm ci` | Install development dependencies from the lockfile |
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Compile TypeScript and bundle the catalog worker/SDK |
| `npm test` | Build, then run `test/*.test.cjs` |
| `npm run check:privacy` | Scan public source for private data |
| `npm run package` | Build a Windows x64 VSIX and SHA-256 sidecar under `release/<version>/`; refuse existing output files |
| `npm run test:host` | Run real Extension Host checks in a separate local profile |

Unit tests use synthetic data and mocks and do not require AI accounts or existing conversation IDs. `dist/`, `.local/`, `node_modules/`, `release/`, and VSIX files are generated outputs excluded from Git. For a same-version verification rebuild, use a new output path such as `npm run package -- --out .local/rebuild-check/package.vsix`. Installed tests read the archived package for the manifest version from `release/<version>/`; check whether it matches the current source before interpreting the result.

## Working on source

The `.vscode/launch.json` and `.vscode/tasks.json` files provide extension development settings. Open this repository in VS Code and use F5 to launch an Extension Development Host. Keep the test profile separate from ordinary work windows.

Regression coverage should focus on JSON-RPC framing/timeouts/pagination, provider isolation, Windows path boundaries, safe arguments/environment, Trust/remote guards, cancellation/late results, terminal reuse, and layout. Update `.vscodeignore` when adding a runtime module.

For new CLI behavior, verify **+ → existing folder selection → new editor terminal**, including synthetic folders outside the workspace, cancelled selection, rapid repeated launches, configuration/Trust changes during waits, and the nine-terminal limit. Native session persistence may require interaction; distinguish launch success from saved-ID confirmation.

## Real Extension Host

`npm run test:host` requires a local VS Code installation and Codex CLI. Actual Antigravity/Claude catalog results depend on installed CLIs and stores. The command can query real metadata and open the Codex picker, so it does not run in account-free CI.

Override the executable if VS Code is installed elsewhere. This example path is synthetic:

```powershell
$env:MULTI_CLI_CODE_EXE = 'C:\example\apps\VSCode\Code.exe'
npm run test:host
```

Build the package before testing the installed extension:

```powershell
npm run package
node scripts/test-host.cjs --installed
```

Profiles, the test driver, and local output live under `.local/`. The current editor host test covers one through nine terminals, original PIDs/document tabs, 9-to-8-to-9 reflow, and rejection of a tenth launch. VS Code can flatten a column containing one leaf; layout comparison normalizes this representation. API-based layout assertions are not a visual readability or screenshot review.

The standard host harness and `@vscode/test-electron` disable Workspace Trust for normal integration tests. A genuine untrusted-window test must use a separate driver without that bypass. Do not claim Trust UI verification from a standard host run. The recorded untrusted-window result and remaining UI revocation gap are in [README](../README.md#current-status-and-validation).

## Authorized history restoration

Do not resume arbitrary existing conversations. Obtain a user-authorized test ID and a known phrase expected in its restored screen.

| Provider | Test environment variables |
|---|---|
| Codex | `MULTI_CLI_TEST_SESSION_ID`, `MULTI_CLI_TEST_HISTORY_MARKER` |
| agy CLI | `MULTI_CLI_TEST_AGY_SESSION_ID`, `MULTI_CLI_TEST_AGY_HISTORY_MARKER` |

A marker must contain at least 12 characters. Never commit actual IDs/markers in repository files, scripts, or workflow examples. Without ID variables, the harness does not automatically resume existing conversations. After supplying authorized values through environment variables, run `node scripts/test-host.cjs --installed`.

The harness removes verification variables from provider child environments. Screen checks temporarily use terminal selection and the clipboard, restore the original clipboard, and do not persist conversation text or markers in files/fixtures/logs. This does not mean the product collects general Terminal API output.

Report these outcomes separately:

1. A launch request created a terminal.
2. The native CLI rendered its conversation screen.
3. A known historical phrase was restored.
4. The same check passed in the final installed VSIX.

## New-session tests

The standard opt-in check opens all three native startup screens in synthetic temporary folders outside the workspace. It does not resume existing conversations, send prompts, or accept login/trust gates. It verifies the banner or explicit startup gate, selected cwd, default arguments, icons, and three-column layout. Native CLIs may write their own initial state.

```powershell
$env:MULTI_CLI_TEST_NEW_SESSIONS = '1'
node scripts/test-host.cjs --installed
Remove-Item Env:MULTI_CLI_TEST_NEW_SESSIONS
```

Testing response generation and saved IDs is a separate action. Only when explicitly authorized by the user, create isolated folders at the agreed location, send minimal synthetic prompts, and check persistence and subsequent restoration. Do not relax product permissions or inject prompts into normal **+** behavior. Authentication failures must remain failures; a saved failure record is not a successful model response.

## CI and completion criteria

[The Windows workflow](../.github/workflows/ci.yml) installs locked dependencies, checks types, runs synthetic tests and privacy checks, and builds a VSIX. It uploads only a build artifact; it does not run native AI CLI/host tests or publish a release.

For documentation-only changes, validate relative links/anchors, English text, obsolete references, and privacy. Do not rerun live AI sessions merely to validate prose. For code/build changes, run checks appropriate to the change and inspect final package contents when affected.

Update [README's status](../README.md#current-status-and-validation) and [roadmap](../README.md#roadmap-and-open-decisions) instead of creating separate status or plan files. Keep detailed evidence in English under `docs/`. Record dates and distinguish new checks from historical results.
