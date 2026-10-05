# Package review and release

## Preparing source for sharing

The public source directory is the repository root for [hcscat/hcscat-multi-cli](https://github.com/hcscat/hcscat-multi-cli). The owner authorized the first source push on 2026-10-05. Inspect the current branch and remote before subsequent commits or pushes.

Include source, synthetic tests, build scripts, icons, manifest/lockfile, VS Code development settings, public English guides, AI instructions, and Windows CI. Exclude private handoffs/review originals, conversations, account data, `.local/`, `node_modules/`, provider stores, and installation profiles.

Before sharing new files, inspect for credentials, tokens, authentication settings, real session IDs or known history markers, conversation screens, usernames, personal paths/project names, provider DB/JSONL files, logs, and archived private profiles. Documentation paths and fixtures should be synthetic.

If a Git repository exists, inspect `git status --short` and `git diff --cached` before committing/uploading. `.gitignore` does not remove files already tracked. Automated privacy scans supplement file/diff review and do not prove that every possible secret is absent.

## Build and inspect the package

```powershell
npm ci
npm run typecheck
npm test
npm run check:privacy
npm run package
```

The output is `release/<version>/multi-cli-win32-x64-<version>.vsix`, using the manifest version, with an adjacent `.vsix.sha256` checksum file. Keep package/lockfile versions and App Server client metadata consistent. Packaging refuses to overwrite an existing package or checksum. Bump the version for a new release; for a same-version verification rebuild, use a new path such as `npm run package -- --out .local/rebuild-check/package.vsix`.

When no repository URL is configured, local packaging skips README relative-link rewriting. Once a real repository URL is present, normal vsce rewriting is enabled. Set the actual repository before public publication and check links in the rendered extension listing. This local fallback does not add repository documentation to the VSIX.

`.vscodeignore` excludes everything, then explicitly allows required files. The VSIX contains the manifest, README, LICENSE, NOTICE, runtime JS/MJS, icons, and third-party notices. Verify that the packaged LICENSE and NOTICE match the source copies; vsce stores the license as `extension/LICENSE.txt` and references it from the VSIX manifest. Packaging does not bypass the license-file check. TypeScript sources, tests, and local handoffs are excluded. Add new runtime modules to the allowlist explicitly.

Inspect ZIP contents without renaming the package:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$releaseVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$releasePackage = Get-Item -LiteralPath "release/$releaseVersion/multi-cli-win32-x64-$releaseVersion.vsix"
if (-not $releasePackage) { throw 'No VSIX package found.' }
$releaseZip = [System.IO.Compression.ZipFile]::OpenRead($releasePackage.FullName)
try { $releaseZip.Entries | Select-Object FullName, Length }
finally { $releaseZip.Dispose() }
Get-FileHash -LiteralPath $releasePackage.FullName -Algorithm SHA256
```

Inspect content as well as filenames: scan text entries for IDs, personal paths, and secret patterns. Preserve upstream notices and do not bundle native AI CLI executables. After safely extracting to a separate temporary folder, run `node scripts/check-privacy.cjs <extracted-folder> --include-generated` to include runtime files. The default source scan excludes generated `dist/`, so it cannot establish package-wide privacy. Reviewed SDK UUID constant/hash exceptions apply only to the specific bundle paths.

README is packaged with the extension. Documentation changes can change VSIX size/hash without changing runtime code. Recompute artifact metadata for every release build rather than copying historical values from the README.

## Installed-extension verification

1. Install the VSIX into a separate local VS Code profile.
2. Check the three provider views, path/session hierarchy, and exact/descendant/all-local scopes.
3. Check **+**, cancelled folder selection, a folder outside the workspace, and provider icons.
4. Check editor layouts, original process IDs, document tabs, and the terminal limit.
5. For Resume changes, verify authorized Codex/agy conversations using known historical phrases.

Automated installed tests use:

```powershell
node scripts/test-host.cjs --installed
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for CLI/account prerequisites, environment variables, authorization boundaries, and Trust-test limitations. Record sanitized version, package size/hash, unit results, UI results, history restoration, and unverified cases in [README](../README.md#current-status-and-validation). Package creation is not proof of successful Resume.

## GitHub and Marketplace

CI runs on push, pull request, or manual dispatch. It builds a Windows VSIX and retains a build artifact for a limited period. It does not create GitHub Releases, push tags, publish to Marketplace, or use publication credentials.

Local `release/<version>/` directories hold binaries and checksums and are excluded from Git and the public source snapshot. CI collects `release/**/*.vsix` and adjacent checksums. Future GitHub Releases should associate a source tag with the verified package, checksum, and release notes; Marketplace publication remains a separate operation. Preserve existing archived binaries rather than rebuilding over them. The owner selected Apache-2.0 on 2026-10-04; this does not rewrite manifests or license files inside historical archived packages.

Use the owner's supplied repository URL and review the commit/upload candidates. A GitHub Release should use a verified package and sanitized release notes.

The display name is `hcscat Multi CLI`. Repository and issue-tracker URLs are configured. Before Marketplace or binary publication, the owner must decide the real publisher/extension ID, supported/verified versions, and the handling of bundled SDK terms. Apache-2.0 has been selected for the project's own code; `multi-cli-local` remains a local packaging publisher. README's attribution expectations do not impose additional license restrictions.

Keep the roles separate:

- [LICENSE](../LICENSE): the unmodified official Apache-2.0 text for this project's own code.
- [NOTICE](../NOTICE): attribution to the original hcscat Multi CLI project and hcscat, without additional license conditions.
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md): dependency notices and upstream terms; preserve them independently of the project license.

If publisher, license, repository metadata, or packaged documentation changes, rebuild and inspect the final VSIX. Do not store publication tokens as plaintext in source or workflows. Follow the current [roadmap and open decisions](../README.md#roadmap-and-open-decisions) without treating it as publication approval.
