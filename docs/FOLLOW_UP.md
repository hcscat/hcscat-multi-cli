# Follow-up validation evidence

The current shared decision list **1-6** is consolidated in [README's roadmap](../README.md#roadmap-and-open-decisions). Use those identifiers in further work rather than mixing them with historical review classifications. This report preserves the supporting validation evidence.

## Additional checks recorded on 2026-10-04

The user authorized new synthetic workspaces and sessions. Runtime code remained at v0.5.1; public tests and documentation were expanded.

- **Editor layout:** a real VS Code Extension Host displayed one through nine terminals in separate groups, preserved original PIDs and document tabs, handled 9-to-8-to-9 reflow, and blocked the tenth request before terminal creation. Tests normalize actual API responses that flatten a single-leaf column.
- **Codex/agy persistence:** a new Codex terminal and agy native print mode received authorized synthetic prompts, returned responses, and saved sessions. Two independent close/reopen cycles per provider restored known text. Duplicate Resume calls reused the same terminal/PID.
- **Claude:** normal response generation was blocked by missing authentication. The native CLI's saved failure record was visible through the official SDK and TreeView. This is evidence for metadata discovery, not successful model response generation.
- **Scope filtering:** all three providers passed path-to-session grouping, workspace-descendant inclusion, unrelated-path exclusion, and exclusion of child-folder records in exact-workspace scope.
- **Workspace Trust:** the installed extension was inactive and created no terminals in a genuinely untrusted window; the same installed extension activated in the trusted control. UI revocation during an in-flight launch was not part of this result.
- **Process lifecycle:** the final three App Server dispose cycles and three stdin-EOF cycles ended both the server and observed conhost descendants. No MCP leak was reproduced in the tested listing-only configuration.
- **Performance:** ten runtime-validation calls and ten catalog calls per provider were measured. Median catalog times were approximately 114ms for Codex, 101ms for agy, and 214ms for Claude. These measurements do not justify urgent caching at the tested scale and cannot be generalized to large stores or every MCP configuration.
- **agy version parsing:** repeated runtime checks and actual Resume succeeded. Version-output failures caused by extra warnings were not reproduced, so the strict parser was retained.

Typecheck and 70 unit/synthetic tests passed. Native folder-trust gates and TUI input-confirmation steps were distinguished from product errors. Real IDs, credentials, conversation screens, and personal paths were excluded from public files. The existing VSIX and default user installation were not changed by this follow-up run.

## Remaining evidence limits

Authenticated Claude response/persistence and UI Trust revocation remain decision-list item 5. Foreign terminal behavior, path policy, presentation feedback, and production API changes remain optional product decisions. Publication/license decisions are separate from permission to run tests. Actual remote-window behavior and visual theme/readability reviews remain outside these recorded checks.
