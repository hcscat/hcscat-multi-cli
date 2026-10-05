# v0.5.0 implementation and source review

This is a historical review of v0.5.0, covering source, tests, scripts, manifest/lockfile, VSIX inclusion policy, and the public source snapshot. Current implementation status and plans are consolidated in [README](../README.md#current-status-and-validation).

## Implemented scope at that release

The extension provided provider-specific path-to-session TreeViews, workspace-descendant filtering, Codex/agy CLI Resume, provider icons, and automatic editor-terminal layouts. v0.5.0 added **+** actions to start a native CLI in any selected existing local folder. It did not inject prompts, Resume/continue options, or model arguments. Claude saved-session Resume and agy app/IDE imports remained out of scope.

## Reproduced defects and fixes

| Priority | Reproduced defect | Fix |
|---|---|---|
| P1 | Configuration changes during folder selection, a new-terminal notification, or editor-queue waits could launch stale executables/stores | Carry configuration/disposal epochs and list-identity checks through to the final createTerminal call; recheck after waits |
| P1 | setEditorLayout could indirectly merge groups containing foreign terminal editors | Block before layout changes when unmanaged terminal editors or ambiguous duplicate names are present; apply the same guard to close-triggered reflow |

A later check reproduced a same-name foreign terminal being mistaken for an owned terminal in the panel. The implementation now checks different Terminal objects with the same name. Actual VS Code terminal-close events can precede editor-tab removal, so reflow waits for tab cleanup before checking ownership.

No additional mandatory defect was identified in source-store read-only access, worker timeout/cancellation, provider isolation, ID/namespace checks, PowerShell quoting, machine settings, or the package allowlist during this review. This is a historical assessment, not a guarantee that all defects were absent; see the later [v0.5.1 review](REVIEW_0.5.1.md).

## Public source and privacy

The public directory was prepared as an independently buildable snapshot with source/tests/scripts/icons, manifest/lockfile, VS Code development settings, guides, state/plan handoff documents, AI instructions, and Windows CI. The former public state/plan documents have since been consolidated into README.

Private local handoffs, raw historical reviews, `.local/`, real conversation IDs/content, credentials, provider DB/JSONL/log files, profiles, and build artifacts were excluded. Allowlist export used a privacy preflight before copying and a final public-folder scan. The checker looked for personal profile/project prefixes, non-synthetic UUIDs, credential patterns, sensitive file types, and symlinks without printing matching values. Pattern checks do not replace manual file/diff review.

Synthetic regression coverage included credential keys closed by JSON quotes. Export rejected source/destination symlinks and copied the bytes that passed staging review. Unknown files were not deleted during snapshot refresh.

The minimum runtime was set to the tested VS Code 1.140 because agy discovery requires Extension Host `node:sqlite`. API typings for an older version do not establish provider/runtime compatibility.

The project retained `UNLICENSED` and the local packaging publisher; no GitHub remote publication or Marketplace release was performed. Windows CI only built, tested synthetic cases, and produced a VSIX artifact.

## Results recorded for v0.5.0

| Check | Result |
|---|---|
| Types and synthetic tests | Passed, 63/63 |
| Installed extension | Provider lists/scopes, 1/2/3-column and 2x2 layouts, PID/document preservation, close-triggered reflow, empty results, special arguments, owned-process cleanup |
| Three new CLI screens | Synthetic folders outside the workspace; banner or explicit login/trust gate; selected cwd/default args/icons; three columns and PID preservation; no model input |
| Existing conversations | Authorized Codex/agy markers restored; duplicate reuse, simultaneous display, original PIDs retained; no real IDs/content persisted in evidence |
| Independent source copy | Fresh npm ci, typecheck, tests, privacy scan, and packaging passed |
| Privacy | 59 source files and 26 package entries passed; reviewed SDK namespace/UUID MAX exceptions limited to bundle path/hash |
| VSIX | 320,841 bytes; 26 allowlisted entries; 13 runtime JS/MJS files matched the installed package |
| Dependencies | Audit reported zero vulnerabilities with and without development dependencies |

Historical VSIX SHA-256: `f846c2568303570b8ca505ced440499a3b6913d69b38c906aad53ac957159647`.

At this release, new persistent IDs, actual five-to-nine layouts, visual screenshots, and remote windows had not been verified. Native startup was not treated as proof of persistence. Later new-session and layout checks are recorded in [FOLLOW_UP.md](FOLLOW_UP.md). No remote workflow run or public upload was performed as part of this local verification.
