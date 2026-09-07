# kestrel-web

A Nuxt 4 meta-layer for the Kestrel v2 CMS: an editorial admin (`/admin`) and the public site that
renders published content, both wired to a Kestrel backend embedded in the app's own Nitro server.

```
pnpm install
pnpm dev          # http://localhost:3000/admin — admin / change-me
```

Requires Node 22.13 or newer (`node:sqlite`) and pnpm 11 (`corepack enable`). The Kestrel backend
packages (`@michaelthielemann/kestrel*`) are installed from npm.

`pnpm dev` runs the `playground` app, the reference consumer of this layer. To use kestrel-web in
your own app, see `docs/consuming-kestrel-web.md`. For how the pieces fit together, see
`docs/architecture.md`.

## Layout

To develop against an unpublished backend checkout, point the packages at its sources with a pnpm
override in `pnpm-workspace.yaml` (do not commit it):

```yaml
overrides:
  "@michaelthielemann/kestrel": "link:../kestrel/packages/core"
  "@michaelthielemann/kestrel-contracts": "link:../kestrel/packages/contracts"
```

- `layers/core` — boots the embedded Kestrel backend (Nitro plugin) from the consumer's
  `kestrel.config.ts` plus its optional `kestrel.modules.ts`/`pipelines/` (each falls back to a
  `layers/core` default via `#kestrel/consumer-modules`/`#kestrel/consumer-pipelines` when absent);
  serves every backend route under `/api`; provides the standard pipelines/triggers/schemas as a preset
  (`#kestrel/pipelines`), the standard module implementations (`#kestrel/modules`), the standard admin
  collection UI (`#kestrel/collections-ui`), discovers the consumer's block SFCs into `#kestrel/blocks`
  and its migration files into `#kestrel/migrations`.
- `layers/admin` — the editorial UI at `/admin` (Nuxt SPA; reaches into the consumer via
  `#kestrel/blocks`, `~~/shared/model` and `~~/shared/collections-ui`).
- `layers/public` — the public site that renders published content.
- `packages/renderer-nuxt` — the `renderer@1` module that lets `delivery-static` render pages through
  `layers/public`.
- `playground` — the reference consumer used for development.

## Commands

- `pnpm dev` — `nuxt dev playground` → http://localhost:3000 (admin at `/admin`, API at `/api`, login `admin` / `change-me`)
- `pnpm build` / `pnpm preview`
- `pnpm typecheck` — `nuxt typecheck playground`
- `pnpm test` — vitest (`layers/**/*.test.ts`, `packages/**/*.test.ts`)
- `pnpm lint` — `nuxt prepare playground && eslint .`

## Conventions

- Backend routes go through `useApi()` only (Bearer token from cookie `kestrel_token`); never
  `$fetch('/api/…')` for `/api/*`.
- The consumer owns its content model and feature selection (`shared/model.ts`), its Kestrel config
  (`kestrel.config.ts`), its admin collection UI (`shared/collections-ui.ts`) and its block library
  (one `app/blocks/*.vue` per block; the picker thumbnail is a sibling `<Block>.webp|jpg|png` or lives in
  `kestrel.blockImagesDir`). Standard pipelines, module implementations and the `settings`/`redirects`
  UI come from the presets in `layers/core`, never from the consumer; `layers/admin` never imports a
  specific consumer.
- A block SFC's `defineProps({ heading: textField(…) })` is its schema and `defineBlock({ … })` its
  metadata; both arguments must be self-contained literals plus factory calls (read statically at
  build). `.nuxt/kestrel/pages.body.json` is generated from them — never hand-edit it.
- Ids are strings; dates are ms since epoch; one locale is edited at a time (`?locale=`).
- `NUXT_PUBLIC_SITE_URL` (runtime config `public.siteUrl`) is the only place the admin needs the public
  site's base URL (preview links, SEO fields); it stays empty in dev.
- No code comments except eslint/ts directives — self-explaining code, explanations in `docs/`.
  English in code and docs.

## Documentation

| doc | when to read |
|---|---|
| `docs/architecture.md` | How the layers, the embedded backend, the API client and the block/renderer contracts fit together. |
| `docs/consuming-kestrel-web.md` | Step-by-step for a new app that extends `kestrel-web`. |
| `docs/migrations.md` | Rewriting stored content after a block or model change: enabling the module, writing migrations, run modes, the admin tab. |
| `docs/porting-notes.md` | What changed versus the predecessor admin UI and which of its features have no backend equivalent. |
| [backend `docs/api.md`](https://github.com/MichaelThielemann/kestrel/blob/main/docs/api.md) | The HTTP contract every composable and pipeline is written against. |

## License

Apache-2.0 — see `LICENSE`.
