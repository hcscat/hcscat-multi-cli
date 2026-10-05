# Public-source review and commit preparation

Review date: 2026-10-05. Product: **hcscat Multi CLI**, version **0.5.3**.

## Review result and scope

No sensitive-data disclosure was identified in the reviewed public source snapshot. The automated content scan was supplemented by an independent read-only review of source, tests, scripts, documentation, lockfile URLs, CI permissions, SVG content, and embedded PNG metadata. `hcscat` is the owner's intentionally public attribution, not a private account name accidentally copied from the workstation.

- No credentials, private keys, authentication files, personal absolute paths, actual session IDs, conversation excerpts, provider databases, logs, installation profiles, or binary archives were found in the public snapshot.
- Lockfile download URLs use the public npm registry. No credentials embedded in URLs or private registry addresses were identified.
- The seven SVG assets contain no active scripts or externally loaded resources. Embedded Google PNGs contain image, color, and resolution chunks, with no EXIF or text metadata.
- CI has read-only repository-content permission, does not persist checkout credentials, and does not use publication secrets or real AI accounts. Provider diagnostics do not persist raw provider errors or conversation bodies in the extension's Output Channel.
- Historical source-review documents retain their original version labels. Their old validation results are not evidence of newly repeated live-provider tests.

This review covers the current files, not unavailable Git history or every possible future secret format. Re-run `npm run check:privacy` before each upload. For a safely extracted VSIX, run `node scripts/check-privacy.cjs <extracted-folder> --include-generated` so generated runtime files are included. Current validation results are recorded in [README](../README.md#current-status-and-validation).

The first source push was prepared on 2026-10-05 after typechecking and 70/70 synthetic tests passed. The public directory contains 64 source files including `.gitattributes`; its privacy scan found zero issues, and all 54 relative documentation links/anchors across ten English Markdown files passed validation. Locked dependencies were installed in this public directory and its own build/package command succeeded. Generated dependencies, build output, and the verification VSIX are ignored by Git. Existing archived release binaries were preserved.

## Files already prepared for a source commit

Use this public snapshot as the repository root. Do not upload its parent development workspace or private handoff documents.

| Files | Purpose |
|---|---|
| `src/`, `media/` | Extension source and packaged assets |
| `test/` | Synthetic unit tests and explicit host-test drivers |
| `scripts/` | Build, package, diagnostics, and privacy tooling |
| `package.json`, `package-lock.json`, `tsconfig.json` | Manifest, locked dependencies, and TypeScript configuration |
| `.gitignore`, `.gitattributes`, `.vscodeignore` | Git inclusion boundaries, text line endings, and VSIX inclusion boundaries |
| `.vscode/`, `.github/workflows/ci.yml` | Local development settings and Windows build CI |
| `README.md`, `AGENTS.md`, `docs/` | Public usage, AI contributor guidance, validation, and release instructions |
| `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md` | Apache-2.0, original-author attribution, and separate upstream terms |

No additional source file is required merely to create a commit and push this prepared project. Commit the source and lockfile; do not commit `node_modules/`, `dist/`, `.local/`, `release/`, VSIX files, logs, provider stores, or authentication material. Release binaries belong in GitHub Releases after a separate publication decision.

## Optional additions

| Suggested file | Benefit |
|---|---|
| `CHANGELOG.md` | A dedicated version history; current history is in README |
| `CONTRIBUTING.md` | Contribution and pull-request guidance; development instructions already exist |
| `SECURITY.md` | A private vulnerability-reporting route, after the owner chooses that route |
| `.github/ISSUE_TEMPLATE/` | Structured bug and feature reports |
| `.github/pull_request_template.md` | A concise change and validation checklist |

These files are optional recommendations and were not created as placeholders with invented contacts or policies.

## Git configuration and remaining publication decisions

At the initial review, this snapshot and its parent workspace were not Git repositories. On 2026-10-05, the owner supplied [hcscat/hcscat-multi-cli](https://github.com/hcscat/hcscat-multi-cli) and explicitly authorized source initialization, commit, and push. Use this public source directory as the Git root and `main` as the initial branch. Commit attribution uses `hcscat` and the account's GitHub no-reply address. Never add a token or authentication file to the repository. Git's `.git/` directory is local metadata, not a file to commit.

The selected display name is `hcscat Multi CLI`. The package name `multi-cli`, local publisher `multi-cli-local`, command/view/settings identifiers, and App Server identity remain stable. The manifest now points to the supplied repository, README, and issue tracker. A real Marketplace publisher remains to be configured; it is not required for a source-only Git commit.

Before publishing a bundled VSIX, separately review the Claude Agent SDK's distribution terms and provider-logo rights in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Selecting Apache-2.0 for the project's own code does not relicense third-party material. Follow [RELEASE.md](RELEASE.md) for final package inspection and publication.
