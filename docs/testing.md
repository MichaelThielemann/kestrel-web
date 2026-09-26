# Testing

`pnpm test` runs vitest: unit tests, and component tests in a simulated DOM. `pnpm test:e2e` runs
the Playwright suite under `e2e/` in a real Chromium against a production build of the playground.
It is separate from `pnpm test` and runs as its own `e2e` job in CI.

## Running the end-to-end suite

```
pnpm exec playwright install chromium   # once per Playwright version
pnpm test:e2e
```

One run builds the playground (`pnpm build`), starts `playground/.output/server/index.mjs` on
`127.0.0.1:3091` with an empty data directory under the system temp directory, seeds it through the
API and runs every spec with one worker. The server is stopped and the data directory removed at the
end. The whole run takes about a minute on a warm build cache.

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
- `e2e/specs/fresh/` — specs that read the seeded state unchanged: accessibility (axe, WCAG 2.2 AA),
  screenshot comparisons, the editor preview, Insights and the static export.
- `e2e/specs/flows/` — specs that change content: sign-in and rights, pages and subpages, path
  conflicts and renames, collection mounts, media. The `flows` project depends on `fresh`, so the
  screenshots always see the seed.

The login route allows five attempts per minute and client address. Specs reuse the stored sessions
and sign in through the form only where signing in is what they test.

## Screenshots

`toHaveScreenshot()` compares against `e2e/specs/__screenshots__/`. While comparing, the page gets
`e2e/support/screenshot.css`, which sets every font to Liberation Sans, so a local Linux machine and
the CI runner (`playwright install --with-deps` installs the font) render the same glyphs. Up to 1 % of
the pixels may differ. After an intended visual change, record new baselines and review the diff before
committing them:

```
pnpm test:e2e -g "looks as recorded" --update-snapshots
```

## When a run fails

The failing test's trace, screenshot and page snapshot are in `e2e/test-results/`; open a trace with
`pnpm exec playwright show-trace <trace.zip>`. In CI the job uploads `e2e/test-results`,
`e2e/playwright-report` and `e2e/server.log` as the `e2e-results` artifact.
