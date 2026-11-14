# Testing

`pnpm test` runs vitest: unit tests, and component tests in a simulated DOM. `pnpm test:e2e` runs
the Playwright suite under `e2e/` in a real Chromium against a production build of the playground.
`pnpm test:e2e:visual` runs the screenshot comparisons of the same suite inside a pinned container.
Neither is part of `pnpm test`; CI runs them as the `e2e` and `visual` jobs.

## Running the end-to-end suite

```
pnpm exec playwright install chromium   # once per Playwright version
pnpm test:e2e
```

One run builds the playground (`pnpm build`), starts `playground/.output/server/index.mjs` on
`127.0.0.1:3091` with an empty data directory under the system temp directory, seeds it through the
API and runs every spec with one worker. The server is stopped and the data directory removed at the
end. A run takes about 40 seconds on a warm build cache, about 20 of them for the build; `pnpm test:e2e:visual` about 30.

| variable | default | effect |
|---|---|---|
| `KESTREL_E2E_PORT` | `3091` | port of the server; 3000 and 3005 are refused |
| `KESTREL_E2E_WORK_DIR` | `<tmp>/kestrel-e2e-<port>` | data directory, seed ids and stored sessions of one run; wiped at start and end |
| `KESTREL_E2E_SKIP_BUILD` | unset | `1` reuses the existing `playground/.output` instead of building |

Playwright's own flags pass through: `pnpm test:e2e -g "mounted"`, `pnpm test:e2e --project flows
--no-deps`, `pnpm test:e2e --headed`, `pnpm test:e2e --ui`.

## Layout

- `e2e/playwright.config.ts` — Chromium, German admin locale, 1440 × 900, trace and screenshot kept
  on failure. The `webServer` entry runs `e2e/serve.ts`, which builds and starts the server; its log is
  `e2e/server.log`.
- `e2e/support/seed.ts` — the fixed content every run starts from: two images, published pages in
  German and English (one with a subpage, one holding the `blog` collection), a draft, a post, the
  settings of both locales, and an `editor` user without admin rights. `global-setup.ts` runs it and
  stores the admin and editor sessions, so specs start signed in with `test.use({ storageState })`.
- `e2e/support/fixtures.ts` — `seed` (the seeded ids), `adminApi` and `editorApi` (API clients on the
  stored sessions) and `visitor` (a request context without any session, for what the public sees).
- `e2e/support/editor.ts` — `save(page)` clicks Save, waits for the answer to the write request it
  started, requires a 2xx and waits until the Save button is disabled again. `submitSave(page)` returns
  the answer without judging it, for a save that is meant to fail.
- `e2e/specs/fresh/` — specs that read the seeded state unchanged: accessibility (axe, WCAG 2.2 AA),
  the editor preview, Insights and the static export.
- `e2e/specs/flows/` — specs that change content: sign-in and rights, pages and subpages, path
  conflicts and renames, collection mounts, media. The `flows` project runs after `fresh`.
- `e2e/specs/visual/` — the screenshot comparisons, a project of their own that no other project
  depends on.

The login route allows five attempts per minute and client address. A run uses four: the global setup
signs in the admin and the editor once each, and the sign-in spec submits a wrong and a right password.
Every other spec reuses the stored sessions; a new spec that needs a session takes one of those, and
only a spec about signing in itself uses the form.

## Screenshots

Glyph rasterisation differs between distributions, so the baselines are only recorded and compared in
the Playwright image pinned by digest in `e2e/support/env.ts` (`VISUAL_IMAGE`), which the `visual` CI
job also runs in. Outside it the visual specs skip themselves. Locally, with podman:

```
pnpm test:e2e:visual
pnpm test:e2e:visual --update-snapshots   # after an intended visual change; review the diff before committing
```

The script builds the playground on the host and runs the `visual` project in the container with the
repository mounted at `/work`, using the host's `node_modules`. The container ships the browsers of
one Playwright release only, so `@playwright/test` and `playwright-core` (the peer of
`@axe-core/playwright`) are pinned to the image's exact version; `scripts/playwright-image.test.ts`
fails when the image, the CI job and the installed packages disagree. Moving to a newer Playwright
means changing the image tag and digest in `e2e/support/env.ts` and `.github/workflows/ci.yml` together
with both pins. The baselines live in
`e2e/specs/__screenshots__/`; a comparison allows at most 50 differing pixels. The preview iframe and
the host name in the editor's search preview are masked.

## When a run fails

The failing test's trace, screenshot and page snapshot are in `e2e/test-results/`; open a trace with
`pnpm exec playwright show-trace <trace.zip>`. In CI each job uploads `e2e/test-results`,
`e2e/playwright-report` and `e2e/server.log` as an artifact.

## Lockfile

The e2e dev dependencies (`@playwright/test`, `@axe-core/playwright`) are declared in `package.json`
but not yet in `pnpm-lock.yaml`: the lockfile can only be regenerated once every Kestrel 6 package is on
npm. Until then `pnpm install --frozen-lockfile` fails in all three CI jobs for that one reason. As
part of the release, after the Kestrel packages are published, run `pnpm install` with the committed
`pnpm-workspace.yaml` (no local overrides) and commit the resulting `pnpm-lock.yaml`.
