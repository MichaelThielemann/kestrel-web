# kestrel-web

`@michaelthielemann/kestrel-web` is a Nuxt 4 layer that gives a Nuxt app two things at once:

- **an editorial admin UI at `/admin`** — content list and record editor, page builder, media library,
  users, and the system screens for delivery, redirects, images, references, replication, events and
  version history;
- **a public site** that resolves and renders the published content.

Both talk to a [Kestrel](https://github.com/MichaelThielemann/kestrel) backend that the layer boots
**inside the app's own Nitro server** and serves under `/api`. There is no second process and no
separate deployment: `nuxt build` produces one `.output` that contains the site, the admin and the CMS.

A consuming app owns its content model, its Kestrel configuration and its block library. Everything
else — pipelines, module wiring, admin UI, validation schemas — comes from the layer.

```ts
// nuxt.config.ts of your app
export default defineNuxtConfig({
  extends: ["@michaelthielemann/kestrel-web"],
});
```

Full walkthrough: [`docs/consuming-kestrel-web.md`](docs/consuming-kestrel-web.md).

## Working on this repository

## Start a site

```
pnpm create kestrel my-site
```

`create-kestrel` (`packages/create-kestrel`) asks for locales, features, blobstore and an admin
password and writes a ready-to-run consumer. `docs/consuming-kestrel-web.md` describes the same
project by hand.

## Develop this layer

```
pnpm install
pnpm dev          # http://localhost:3000/admin — admin / change-me
```

Requires Node 22.13 or newer (`node:sqlite`) and pnpm 11 (`corepack enable`). The Kestrel backend
packages (`@michaelthielemann/kestrel*`) are installed from npm.

`pnpm dev` runs `playground/`, the reference consumer of this layer.

| command | what it does |
|---|---|
| `pnpm dev` | `nuxt dev playground` → http://localhost:3000 (admin at `/admin`, API at `/api`) |
| `pnpm build` / `pnpm preview` | production build of the playground, and a preview server for it |
| `pnpm typecheck` | `nuxt typecheck playground` |
| `pnpm test` | vitest (`layers/**/*.test.ts`, `packages/**/*.test.ts`, `scripts/**/*.test.ts`) |
| `pnpm lint` | `nuxt prepare playground && eslint .` |
| `pnpm build:packages` | builds `packages/*` (the renderer's `dist/`) |

To develop against an unpublished backend checkout, point the packages at its sources with a pnpm
override in `pnpm-workspace.yaml` (do not commit it):

```yaml
overrides:
  "@michaelthielemann/kestrel": "link:../kestrel/packages/core"
  "@michaelthielemann/kestrel-contracts": "link:../kestrel/packages/contracts"
```

## Repository layout

- `layers/core` — boots the embedded Kestrel backend (Nitro plugin) from the consumer's
  `kestrel.config.ts` plus its optional `kestrel.modules.ts`/`pipelines/` (each falls back to a
  `layers/core` default via `#kestrel/consumer-modules`/`#kestrel/consumer-pipelines` when absent);
  serves every backend route under `/api`; provides the standard pipelines/triggers/schemas as a preset
  (`#kestrel/pipelines`), the standard module implementations (`#kestrel/modules`), the standard admin
  collection UI (`#kestrel/collections-ui`), discovers the consumer's block SFCs into `#kestrel/blocks`
  and its migration files into `#kestrel/migrations`.
- `layers/admin` — the editorial UI at `/admin` (Nuxt SPA; reaches into the consumer via
  `#kestrel/blocks` only — the content model, collection UI, workflow and features arrive at runtime from
  `GET /api/admin/schema`).
- `layers/public` — the public site that renders published content.
- `packages/renderer-nuxt` — the `renderer@1` module that lets `delivery-static` render pages through
  `layers/public`.
- `playground` — the reference consumer used for development.

## Conventions

- Backend routes go through `useApi()` only (Bearer token from cookie `kestrel_token`); never
  `$fetch('/api/…')` for `/api/*`.
- The consumer owns its content model and feature selection (`shared/model.ts`), its Kestrel config
  (`kestrel.config.ts`), its admin collection UI (`shared/collections-ui.ts`) and its block library
  (one `app/blocks/*.vue` per block; the picker thumbnail is a sibling `<Block>.webp|jpg|png` or lives in
  `kestrel.blockImagesDir`). Standard pipelines, module implementations and the `settings`/`redirects`
  UI come from the presets in `layers/core`, never from the consumer; `layers/admin` never imports a
  specific consumer — and never `~~/shared/*` at all: it reads `GET /api/admin/schema` once per session
  (`useSchema()`) for the model, collection UI, workflow and features.
- A block SFC's `defineProps({ heading: textField(…) })` is its schema and `defineBlock({ … })` its
  metadata; both arguments must be self-contained literals plus factory calls (read statically at
  build). `.nuxt/kestrel/pages.body.json` is generated from them — never hand-edit it.
- Ids are strings; dates are ms since epoch; one locale is edited at a time (`?locale=`).
- `NUXT_PUBLIC_SITE_URL` (runtime config `public.siteUrl`) is the only place the admin needs the public
  site's base URL (preview links, SEO fields); it stays empty in dev.
- Admin UI is built from `layers/admin/app/components/ui` (see `docs/architecture.md` § UI kit first);
  a missing variant is added to the kit.
- Every admin style rule is bound to the admin roots `.admin` / `.admin-portal` and carries no
  `@layer`, so the consumer's global CSS does not reach `/admin` and the admin reset does not reach the
  public site (`docs/architecture.md` § Admin CSS isolation). Consumers are advised to put their own
  reset in a named `@layer` — defence in depth, not a requirement.
- No code comments except eslint/ts directives — self-explaining code, explanations in `docs/`.
  English in code and docs.

## Documentation

| doc | when to read |
|---|---|
| [`docs/consuming-kestrel-web.md`](docs/consuming-kestrel-web.md) | You are building an app on kestrel-web: install, content model, collections, backend config, blocks, images, running, deploying, upgrading. Start here. |
| [`docs/deployment.md`](docs/deployment.md) | You are putting a build into production or operating one: environment variables, persistent volumes, a systemd unit and a Containerfile, reverse proxy, health probes, backups, restarts. |
| [`docs/architecture.md`](docs/architecture.md) | You are changing kestrel-web itself, or need to know why it behaves the way it does: layers and aliases, the embedded backend, the pipeline preset, the admin client, the UI kit and CSS isolation, UI actions, blocks, images, delivery. |
| [`docs/field-types.md`](docs/field-types.md) | A field needs an editing control the built-in types don't have: the factories, the admin field registry, the generated schema, and what `field("myType")` does and does not get you. |
| [`docs/admin-i18n.md`](docs/admin-i18n.md) | The admin's own language: the two catalogs, the language cookie, how `Localized` labels resolve, and what overriding a string costs. |
| [`docs/migrations.md`](docs/migrations.md) | Stored content has to be rewritten after a block or model change: enabling the module, writing migrations, run modes, the admin tab. |
| [`docs/insights.md`](docs/insights.md) | The `/admin/insights` page: what it shows, the two routes behind it, enabling it, the wiring graph. |
| [`RELEASING.md`](RELEASING.md) | You are cutting a release of this repository. |
| [`packages/renderer-nuxt/README.md`](packages/renderer-nuxt/README.md) | The `renderer@1` module: how a published page is rendered and which assets travel with it. |
| [`CHANGELOG.md`](CHANGELOG.md) | Every behaviour change visible to a consumer, newest first under `## Unreleased`. Read it before upgrading. |
| [backend `docs/api.md`](https://github.com/MichaelThielemann/kestrel/blob/main/docs/api.md) | The HTTP contract every composable and pipeline is written against. |

## License

Apache-2.0 — see `LICENSE`.
