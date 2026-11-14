# Releasing

How to cut a release of this repository. `@michaelthielemann/kestrel-web` (the layer, workspace root),
`@michaelthielemann/kestrel-renderer-nuxt` (`packages/renderer-nuxt`) and `create-kestrel`
(`packages/create-kestrel`) are published together; the playground is private and never published.

1. Resolve the lockfile from scratch with `rm pnpm-lock.yaml && pnpm install`, then run `pnpm audit` and
   `pnpm audit --prod`. Both report no advisory beyond the ids listed under `auditConfig.ignoreGhsas` in
   `pnpm-workspace.yaml`. An install on top of the existing lockfile keeps every version it already pins,
   advisories included, as long as that version still satisfies its range and the overrides. The new lockfile
   goes into the release commit.
2. `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:packages`
3. `./scripts/smoke-consumer.sh` – packs both packages, installs the tarballs into a throwaway Nuxt app
   outside the workspace that extends the layer, builds it, boots it and requests a few pages. This is
   the only check that sees the published shape (`files`, peer dependencies, the layer under `node_modules`).
4. Bump `version` in `package.json` and `packages/renderer-nuxt/package.json`, turn `CHANGELOG.md`'s
   `## Unreleased` heading into the new version, and make sure `docs/` describes the released state —
   the docs carry no history, so anything that changed has to be rewritten there, not appended.
   `packages/create-kestrel` has its own version: bump it whenever the scaffolder or its template
   changed, and run `node scripts/create-kestrel-versions.mjs` so the ranges it writes into a
   scaffolded `package.json` follow the layer version of this release.
5. Commit, tag `v<version>`, push the commit and the tag.
6. The `release` workflow runs on the tag in two jobs:
   - `build` (read-only token, no id token) checks out without keeping the token, installs, verifies
     that the tag matches the root package version and that the scaffolder pins this workspace's
     versions, repeats lint, typecheck, tests, the playground build and `build:packages`, and packs the
     release with `node scripts/release.mjs plan`: the layer and the renderer must carry the tag version;
     `create-kestrel` is part of the release when its version is not on the registry yet, and is left
     out when that version is on the registry with exactly the content of this checkout; any other
     content under an existing version stops the build (bump its version). The tarballs, `release.json`
     and `SHA512SUMS` go up as the `release-artifacts` artifact. No dependency cache is restored
     anywhere in the release.
   - `publish` needs `build` and runs in the GitHub environment `release`, the only place with
     `id-token: write`. It installs nothing: it downloads the artifact, checks every tarball against its
     checksums and the tag, and `node scripts/release.mjs publish` runs `pnpm publish <tarball>
     --provenance` for each one. The registry is asked about every package first: a version that
     is already on the registry with different content stops the job before anything is published;
     one whose registry integrity equals the artifact's is left alone, so re-running a failed
     `publish` job finishes the release.

   Trusted publishing (OIDC, no token): every package needs a trusted publisher on npmjs.com for this
   repository, the workflow file `release.yml` and the environment `release`. The environment has
   required reviewers and admits only `v*` tags, so a release waits for approval before anything is
   published. A package that does not exist on npm yet cannot have a trusted publisher, and the
   release refuses a version that is already on npm with other content, so a new package is never
   published at its release version from a terminal. Before the tag, publish a `0.0.0` placeholder of
   it by hand and trust the workflow, then let the tag publish the real version with provenance:

   ```
   mkdir -p /tmp/placeholder && cd /tmp/placeholder
   printf '%s\n' '{"name":"<name>","version":"0.0.0","description":"Placeholder; the first release is <version>"}' > package.json
   printf '%s\n' 'Placeholder; the first release is <version>.' > README.md
   npm publish --access public
   npm trust github <name> --repo MichaelThielemann/kestrel-web --file release.yml --env release --allow-publish --yes
   ```

   The checksums in the artifact protect the hand-over from `build` to `publish`, not the build
   itself: what `build` packs is what gets published, so the approval of the `release` environment is
   the point to look at the run before anything reaches npm.

`workspace:^` on the renderer is rewritten to the real range by pnpm on pack. pnpm itself is pinned,
with its hash, by `packageManager` in `package.json`; the workflows take it from there.
