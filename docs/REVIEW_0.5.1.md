# v0.5.1 security and stability review

This report was written for the public source snapshot. It excludes private review originals, actual conversations/paths/IDs, and local environment values. Current status and plans live in [README](../README.md#current-status-and-validation).

## Applied changes

- Escape ASCII and U+2018-U+201B single quotes recognized by Windows PowerShell, consistently for native executable paths and session arguments.
- Remove Electron/VS Code host-internal environment variables from discovery, version checks, and editor terminals. Preserve user NODE_OPTIONS, PATH, provider stores, and required VS Code CLI/portable integration values.
- Skip malformed individual Codex and Claude execution records with a reported count. Keep invalid response structures/cursors as errors. Count malformed/duplicate Codex records toward the scan limit.
- On workspace changes, refresh visible views and invalidate hidden views' previous records/in-flight requests. Load hidden views when they become visible.
- Remove redundant page normalization/store hashing and read App Server clientInfo version from the manifest.
- Distinguish preservation of the main SQLite DB from possible WAL/SHM sidecar writes.
- Upgrade `@vscode/vsce` to 4.0.0 to remove the vulnerable transitive `braces` path. The audit count moved from six high-severity dependency entries to zero. That dependency path was not shipped in the VSIX runtime; the existing Node.js 22.13+ requirement accommodates the packaging tool.

## Verification

Typecheck and 70 unit/synthetic tests passed. Ten actual Windows PowerShell cases with synthetic native executables checked smart-quote paths, ordinary arguments, benign command-injection attempts, argument preservation, host-environment removal, and user-setting retention. Tests also covered malformed records followed by valid pages, scan limits, hidden-view invalidation, cancellation, and late responses.

Installed-package and artifact results are in [README's validation section](../README.md#current-status-and-validation). Do not present older history-restoration checks as a newly performed test of this release.

## Follow-up

The shared remaining identifiers **1-6** are in [README's roadmap](../README.md#roadmap-and-open-decisions); additional experiment results are in [FOLLOW_UP.md](FOLLOW_UP.md). Unverified items from the original review are historical, not automatically current gaps.

The proposal to reduce the date bound was rejected: JavaScript Date's limit of +/-8.64e15 milliseconds equals +/-8.64e12 seconds. The existing bound was correct, and boundary regression coverage was added.

## Primary references

- [PowerShell quoting rules](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-5.1)
- [VS Code environment sanitization](https://github.com/microsoft/vscode/blob/1.140.0/src/vs/base/common/processes.ts#L98)
- [VS Code terminal environment construction](https://github.com/microsoft/vscode/blob/1.140.0/src/vs/workbench/contrib/terminal/common/terminalEnvironment.ts#L229)
- [ECMAScript Date bounds](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timeclip)
- [SQLite read-only WAL databases](https://sqlite.org/wal.html#read_only_databases)
- [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [VSCE 4.0.0 release](https://github.com/microsoft/vscode-vsce/releases/tag/v4.0.0)
