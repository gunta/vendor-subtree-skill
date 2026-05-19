# Release Automation

This repository ships four GitHub Actions workflows:

- `ci.yml` runs the monorepo check and build once on Linux, packs the public npm
  artifacts, then smoke-installs them on Linux, macOS, and Windows.
- `prepare-release.yml` opens audited release-preparation pull requests.
- `release-packages.yml` publishes the npm packages when a GitHub Release is published or when the workflow is run manually.
- `deploy-website.yml` deploys the Astro/Starlight website to Cloudflare.

The repository also ships package-manager definitions for downstream distribution:

- `Formula/ingraft.rb` installs the published npm tarball through Homebrew.
- `flake.nix` and `nix/package.nix` expose `github:gunta/ingraft#ingraft` for Nix users.
- `packages/website/public/install.sh` installs the published npm package through Bun, npm, pnpm, or Yarn for shell users.

## npm setup

The package release workflow uses npm Trusted Publishing through GitHub OIDC. Configure each npm package with this trusted publisher:

- Repository: this GitHub repository
- Workflow: `.github/workflows/release-packages.yml`
- Environment: `npm`

Packages:

- `ingraft`
- `@ingraft/skill`

The OpenTUI dashboard ships inside `ingraft`; `packages/tui` is only an internal workspace wrapper.

Do not add an `NPM_TOKEN` secret for the default path. Trusted Publishing uses short-lived OIDC credentials from GitHub Actions.

## Homebrew setup

The checked-in formula points at the npm package tarball for the current package version. After changing the CLI package contents for a release, regenerate the tarball checksum before publishing the formula:

```sh
bun run --cwd packages/cli build
npm pack --json packages/cli
shasum -a 256 packages/cli/ingraft-<version>.tgz
```

Then update `Formula/ingraft.rb` and remove the generated `.tgz`.

## Shell installer setup

The website serves `packages/website/public/install.sh` at
`https://ingraft.dev/install.sh`. The script installs `ingraft@latest` by
default, so publish the npm package before advertising the shell command on a
live release page.

## Nix setup

The Nix package uses `packages/cli/package-lock.json` with `importNpmLock`, so no separate `npmDepsHash` is maintained. When CLI dependencies change, regenerate the isolated lockfile from `packages/cli/package.json` before validating the flake.

## Cloudflare setup

Configure these repository secrets for the website deployment workflow:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ALCHEMY_PASSWORD`
