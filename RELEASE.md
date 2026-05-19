# Release Process

ingraft publishes the canonical CLI to npm as `@ingraft/cli`, keeps the short
`ingraft` package as a compatibility entrypoint, exposes the same CLI through
Homebrew and Nix, and ships the companion agent skill as `@ingraft/skill`.

## Prepare a release

Run the prepare script to bump the current version by one patch:

```sh
bun run release:prepare
```

Use a different automatic bump when needed:

```sh
bun run release:prepare -- --bump minor
```

Or set the exact semver version explicitly:

```sh
bun run release:prepare -- --version 0.4.0
```

The script updates the workspace package versions, `packages/cli/package-lock.json`,
`Formula/ingraft.rb`, and `CHANGELOG.md`. It builds and packs the CLI locally so
the Homebrew checksum matches the npm tarball that will be published.

Then verify the release metadata:

```sh
bun run release:check
bun run check
bun run build
```

Generate the GitHub release body from the changelog:

```sh
bun run release:notes -- --version 0.4.0 --output release-notes.md
```

## GitHub automation

Use the **Prepare release** GitHub Action when you want CI to do the preparation.
Leave the version input blank for the default patch bump, or choose `minor`,
`major`, or `prerelease` from the bump input. If the version input is set, that
exact version wins. The workflow resolves the final version, creates a
`release/vX.Y.Z` branch, runs `bun run release:prepare`, checks the repo, and
opens a release PR.

After the release PR lands, create a GitHub release for tag `vX.Y.Z` and use the
generated changelog notes as the release body. Publishing the GitHub release
triggers **Release packages**, which runs `bun run release:check`, the full repo
checks, builds the packages, and publishes `@ingraft/cli`, the `ingraft`
compatibility package, and `@ingraft/skill` with
npm trusted publishing and provenance.

## Manual safety checklist

- Confirm `CHANGELOG.md` has the release version and date.
- Confirm `Formula/ingraft.rb` points at the matching npm tarball and has a
  64-character SHA-256.
- Confirm `packages/cli/package-lock.json` has the same version as the workspace
  and package manifests.
- Confirm the GitHub release is published only after the release PR is merged.
