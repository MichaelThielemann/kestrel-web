# Releasing

`@michaelthielemann/kestrel-web` (the layer, workspace root) and `@michaelthielemann/kestrel-renderer-nuxt`
(`packages/renderer-nuxt`) are published together; the playground is private and never published.

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:packages`
2. `./scripts/smoke-consumer.sh` – packs both packages, installs the tarballs into a throwaway Nuxt app
   outside the workspace that extends the layer, builds it, boots it and requests a few pages. This is
   the only check that sees the published shape (`files`, peer dependencies, the layer under `node_modules`).
3. Bump `version` in `package.json` and `packages/renderer-nuxt/package.json`, note the changes in the
   docs that describe them.
4. Commit, tag `v<version>`, push the commit and the tag.
5. The `release` workflow runs on the tag: it verifies the tag matches the root package version,
   repeats lint, typecheck, tests, the playground build and `build:packages` (the renderer's `dist/`), then publishes every package that is not on the registry
   yet. It authenticates with npm trusted publishing (OIDC): both packages need a trusted publisher
   on npmjs.com pointing at this repository and the workflow file `release.yml`. A package that does
   not exist on npm yet cannot have one, so its first version is published from the terminal
   (`./scripts/publish-new.sh`, which runs `pnpm publish` in every package whose version is not on the registry yet) and the trusted publisher is added
   afterwards.

`workspace:^` on the renderer is rewritten to the real range by pnpm on pack/publish.
