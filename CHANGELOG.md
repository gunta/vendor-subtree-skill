# Changelog

All notable changes to ingraft are recorded here.

## Unreleased

## 0.3.1 - 2026-05-20

### Changed

- Release maintenance and packaging updates.

### Added

- Publish the canonical CLI as `@ingraft/cli` while keeping `ingraft` as a
  compatibility package for the short `npx ingraft` entrypoint.

### Fixed

- Make the Nix package build and run from a locked flake with explicit runtime
  peers for npm packages that normal installs auto-resolve.

## 0.3.0 - 2026-05-20

### Added

- Public install lanes for npm, Bun, pnpm, Yarn, shell, Homebrew, Nix, and skills.sh.
- Starlight installation tabs with package-manager icons and synced tab state.
- Release automation for version synchronization, changelog notes, Homebrew formula updates, npm provenance publishing, and automatic patch/minor/major/prerelease bumps.
- Landing-page install section and shell installer documentation for zero-friction setup.
- Introduce fork command for editable upstream workspaces
- Enhance repository aliases and local state validation
- Interactive TUI for add-org
- Add-org TUI keyboard mapping
- Add-org TUI reducer + filteredRepos
- Add-org subcommand (non-interactive)
- Doctor Type column (own / fork / upstream)
- Warn when forkMode personal leaks tracked vendor commits
- Default to --local-only when ingraft.forkMode is personal
- Prompt for fork mode when a fork is detected and forkMode is unset
- LocalState fast-path inside listVendored
- Detect fork via gh CLI and upstream remote
- Read/write ingraft.forkMode in git config
- GitHubRepoMeta service + classifyRepo
- Drop localOnly vendors without writing commits
- Treat localOnly vendors as commit-free updates
- Support --local-only on clone-ignore and cache-link strategies
- GitHubOrg service wraps gh repo list
- Error tags for the add-org flow
- Plumb --local-only, --include, --include-dir flags
- Pure parseSince + filterOrgRepos for org repo discovery
- Merge .git/ingraft/state.json into listVendored
- Add LocalState service for .ingraft/state/\* files
- Add .git/ingraft/state.json reader/writer
- Parameterize updateIgnoreFile with gitignore|info-exclude target
- Support positive include/include-dir selection in VendorFilter

### Changed

- Refined the Starlight docs theme with cleaner navigation, tabs, code frames, mobile table-of-contents styling, and overflow fixes.
- Tightened package/release metadata checks across the README, website, Homebrew formula, Nix flake, and GitHub Actions.
- Document add-org and the new doctor Type column
- Cover --local-only, --include-dir, and fork-mode workflows
- Pin vendor prefix to vendor/upstream in local-only integration tests
- Cover default vendor prefix shape
- Restore process.cwd after local-only integration tests
- Assert info-exclude file is removed when prefixes empty

### Fixed

- Made the default TUI quit path reachable when the dashboard starts with the input field focused.
- Mark existing repos in add-org TUI
- Gate TUI state transitions
- Better error classification for parse failures and auth detection
- Align VendorFilter and LocalVendorEntry decoded types with interfaces
- Propagate write errors and write atomically
- Reject empty strings and log corrupt state.json
- Require directory separator after /\*\*/ in globToRegExp
