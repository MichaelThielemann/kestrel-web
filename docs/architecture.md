# Architecture

How kestrel-web is built, for anyone changing it. A consuming app does not need this file — that is
`docs/consuming-kestrel-web.md`; this one starts where the consumer surface ends.

## Layers
`nuxt.config.ts` extends three layers in order:

```
extends: ["./layers/core", "./layers/admin", "./layers/public"]
```

- **`layers/core`** — boots the embedded Kestrel backend once per process and serves it under `/api`.
  Owns no UI. Derives `maxBodyBytes` for the embedded HTTP handler from the media module's `maxBytes`
  (`server/utils/limits.ts`) and exposes it to the admin via `GET /api/limits`.
- **`layers/admin`** — the editorial UI at `/admin` (SPA, `ssr: false` for that route). Its own files
  are addressed via the alias `#kestrel-admin/*`. It imports no consumer TypeScript: the content model,
  the collection UI, the workflow, the active features and the pipeline names all arrive at runtime from
  `GET /api/admin/schema` (**Admin client layer**). The only consumer-generated modules it still reaches
  for are `#kestrel/blocks` (the block library, generated from the consumer's `app/blocks/*.vue`) and
  `#kestrel/consumer-block-tags` — renderer code and labels, not schema.
- **`layers/public`** — the public site that resolves and renders published content.

`packages/renderer-nuxt` is a separate package (not a layer): a Kestrel module that implements the
`renderer@1` contract using `layers/public`'s own rendering, so `delivery-static` can produce static
output for a page.

## Layer boundaries
Every layer has one named entry; relative paths never cross a layer.

| Alias | Target | Who may import it |
| --- | --- | --- |
| `#kestrel-core/*` | `layers/core` (the layer root, so `app/utils/*`, `app/types/api` and `pipelines/__fixtures__/*` are reachable) | `layers/admin`, `layers/public`, tests |
| `#kestrel-admin/*` | `layers/admin/app` | `layers/admin` only |
| `#kestrel/*` | the core entries (`pipelines`, `modules`, `collections-ui`, `cast`, `config`) and the virtual ids of the Nuxt modules (`blocks`, `block-images`, `image-sizes`, `layouts`, `build-assets`, `migrations`, `schemas`, `optional-modules`, `consumer-pipelines`, `consumer-modules`, `consumer-block-tags`) | everyone; this is the surface documented for consumers |

`layers/public` has no alias: nothing imports the public layer. The aliases are registered in
`layers/core/nuxt.config.ts` (Nuxt, Vite and Nitro resolvers), `layers/admin/nuxt.config.ts` and
`vitest.config.ts`. Four ESLint rules in `playground/eslint.config.mjs` enforce the boundaries in CI:
`kestrel/layer-boundaries` fails a relative import that walks into another layer (`../../../core/...`)
or an absolute `~~/layers/...` import that does the same;
`kestrel/no-admin-from-public-or-core` refuses `#kestrel-admin/*` outside `layers/admin`;
`kestrel/no-backend-in-ui-layers` refuses `@michaelthielemann/kestrel*`, including as `import type`, in
`layers/admin`, `layers/public` and `layers/core/app`, except `layers/core/app/types/**`; and
`kestrel/backend-types-only-in-core-app-types` applies inside that `types/**` directory and allows
`@michaelthielemann/kestrel*` there only as `import type`, and bans a package's `*/impl` subpath outright,
type-only import included: those types come from the generated OpenAPI document instead (see "Generated
API types" below). Backend runtime imports live in `layers/core/server`, `layers/core/pipelines`,
`layers/core/config`, `layers/core/module-registry`, `layers/core/modules`, `layers/core/schemas` and
`packages/renderer-nuxt`. Nuxt auto-imports (`runAction`, composables) are not imports and stay
available across layers.

## Generated API types
`layers/core/app/types/openapi.generated.ts` is derived, not hand-written: `pnpm generate:api-types`
(`scripts/generate-api-types.ts`) composes the pipeline preset with every feature enabled, boots a Kestrel
instance from it, generates its OpenAPI document with `@michaelthielemann/kestrel-openapi`, and runs
`openapi-typescript` on that document. The result exports `paths`, `components` and, since every OpenAPI
operation's `operationId` is the pipeline name, an `operations` map keyed by pipeline name — `api.ts` reads
individual response bodies off it, for example `operations['pagePublishStatus']['responses'][200]['content']['application/json']`
for the publish status of a page.

A read that ends with `authz.fields` (see **Public reads and field grants**) documents two answers: its 200
is the union of `components['schemas'][<pipeline>]`, what a caller whose roles keep every field receives,
and `components['schemas'][<pipeline>.anonymous]`, what a caller without a session receives. `api.ts` reads
them through `FullOf<'getMedia'>` and `AnonymousOf<'getMedia'>` rather than off the 200. `MediaItem` is
`FullOf<'getMedia'>`, the admin's item; the public layer's `PublicMediaItem` is `AnonymousOf<'getMedia'>`.
`PublicPageDocument` is the hand-written page (for its `body` and `seo` types) without its timestamps, and
becomes `never` when it names a field the anonymous `resolvePage` answer does not declare, or when that
answer carries a timestamp, so a drift fails `nuxt typecheck`.

`pnpm test` runs `scripts/generate-api-types.ts --check` first (the package.json `pretest` script) and
fails if regenerating would change the file, so a stale generated file or a renamed response field breaks
both `pnpm test` and `pnpm typecheck` (any type in `api.ts` derived from the stale field disappears or
changes shape, and every place that consumes it stops compiling). Regenerate after a backend upgrade or a
pipeline change with `pnpm generate:api-types`, then commit the updated file.

`api.ts` re-exports a name for every type the admin already imports so its own call sites are unaffected.
The types that used to come from a backend package's `impl` subpath (`ImageSizeRow`, `ImagesJob`,
`ImagesFailedVariant`, `Provenance`, `MediaVariant`, `MediaStatus`, `MediaItem`, `PublishStatusEntry`,
`DeliveryState`, `ReplicationStatus`, `ReplicationPoint`, `RestorePointKind`, `ReplicationSnapshotResult`,
`ReplicationRestoreResult`) now alias a piece of `operations[...]` instead. A field a pipeline's
`describe().output` leaves undeclared renders as `unknown` in the generated file (for example
`SettingsDocument.navigation`, still hand-written); such a field would need casting to be usable, so it
stays hand-written rather than being derived.

`MediaItem`, `ReplicationStatus` and `ReplicationSnapshotResult` alias `operations[...]` directly, with no
optionality workaround: the backend packages' `describe().output` marks every field of these three
`required`, matching what the pipelines always set. `layers/core/app/types/api.types.test.ts` pins the
published shape against a hand-written `Expected*` interface, so a field that becomes optional in a future
generated document fails the test instead of silently widening the public type.

The preset that `scripts/generate-api-types.ts` boots grants anonymous callers every public read
(`pages.read`, `settings.read`, `media.read`, `redirects.read`), so every read that ends with
`authz.fields` gets its `.anonymous` answer documented. It enables every `Feature` this layer defines, so the
generated document — and therefore `operations[...]` in `api.ts` — describes the full surface regardless
of which features or collections a given consumer's own `definePreset` call enables; a route a consumer
drops via `exclude` or narrows via `overrides` is missing at run time even though its type still exists.

## Type-assertion boundaries
`as unknown as T` and `as any` are banned by lint (`eslint.config.mjs`'s third config block, no type
information needed). The one sanctioned double cast is `boundaryCast<T>(value, boundary)`, `boundary`
one of `"json"` (`JSON.parse`/fixture data), `"ast"` (a third-party parser's nodes), `"dom"` (a DOM-like
library without types) or `"host"` (augmenting a host/global object) — the only kinds of untyped-source
crossing it may be used at. Server and build code imports it from `@michaelthielemann/kestrel/cast`
(`packages/core/src/cast.ts` in the backend repo); app/browser code, which does not bundle runtime code
from the core package, imports the same function from `layers/core/app/utils/cast.ts` via the
`#kestrel/cast` alias (`layers/core/nuxt.config.ts`, the same mechanism as `#kestrel/pipelines`/`#kestrel/modules`).

Type-aware lint (`playground/eslint.config.mjs`'s `kestrel/type-aware` and `kestrel/type-aware-server`
blocks) covers every layer, `packages/renderer-nuxt`, `packages/create-kestrel` and `playground`, in
both `.ts` and `.vue` files, tests included. It catches unsafe use of `any`-typed values (the
`no-unsafe-*` rules: `no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-call`,
`no-unsafe-member-access`, `no-unsafe-return`, `no-unsafe-type-assertion`), unhandled or misused
promises (`await-thenable`, `no-floating-promises`, `no-misused-promises`, `require-await`),
unnecessary type assertions (`no-unnecessary-type-assertion`) and template expressions that stringify
something other than a string (`restrict-template-expressions`). Each block picks the
`parserOptions.project` matching its files: `kestrel/type-aware` uses `playground/.nuxt/tsconfig.app.json`
for `layers/*/app/**`, `playground/app/**`, `packages/create-kestrel/**/*.ts` (its `template/**` scaffold
is out of scope, since it ships to a consumer project with its own TS project) and `.ts` files directly
in `layers/core/`; `kestrel/type-aware-server` uses `playground/.nuxt/tsconfig.server.json` for server,
pipeline, module and registry code; both fall back to `playground/tsconfig.json` for files the app/server
project doesn't include (e.g. per-layer `nuxt.config.ts`). `.vue` files need
`extraFileExtensions: ['.vue']` on the app block only, since only app code has `.vue` sources.
Three `packages/create-kestrel` test files (`prompts.test.ts`, `scaffold.e2e.test.ts`, `template.test.ts`)
are excluded from `kestrel/type-aware`: they consume the package's untyped `.mjs` sources, which
resolve to `any` and cascade into `no-unsafe-*` findings unrelated to this layer-boundary work.

`layers/core/nuxt.config.ts` sets `typescript: { shim: true }`, and every consumer extending the layer
inherits it: the layer ships a `*.vue` shim so a plain `.ts` file's `.vue` import resolves to a real, if
loosely-typed, component (`field-registry.ts` and `register-builtin-editors.ts` rely on this) instead of
an unresolvable module. `vue-tsc` (`pnpm typecheck`) is unaffected either way, since it resolves `.vue`
files itself and keeps checking real prop types whether or not the shim is present. The shim cannot match
`InsightsGraph.vue`'s `defineAsyncComponent(() => import('#kestrel-insights-canvas'))`, since that bare
alias does not end in `.vue`, so `layers/admin/modules/insights-graph/index.ts` declares that virtual
module's shape directly instead.

## Runtime
```
browser (Nuxt SPA, /admin/**)
   │  useApi()  →  /api/*  (HttpOnly session cookie kestrel_token)
   ▼
Nitro  server/api/[...].ts  →  createKestrelHandler(kestrel, { mountPath: "/api" })
       server/plugins/kestrel.ts  (layers/core)  boots once per process:
         boot({ config: kestrel.config.ts, modules: #kestrel/consumer-modules, pipelines: #kestrel/consumer-pipelines })
         kestrel.start()  (cron + event triggers)
       server/api/health.get.ts  →  { ok, uptimeSeconds } | 503        (liveness)
       server/api/ready.get.ts   →  { ready, uptimeSeconds } | 503     (readiness)
       server/api/admin/schema.get.ts  →  kestrel.run("adminSchemaModel")  (admin schema)
```
`GET /api/health` is liveness and `GET /api/ready` is readiness, and once booted they can disagree:
`/api/ready` is 200 `{ ready: true, uptimeSeconds }` once the boot promise has resolved and the booted
`Kestrel`'s `health()` reports `ok: true`, otherwise 503 `{ ready: false, state, error?, code }` with
`state` (and `code`, the same value — `useApi()`'s generic `ApiError.code` is how the admin layout reads
it without a bespoke fetch) one of `booting`, `failed` (boot rejected) or `degraded` (booted, but
`health().ok` is false). `/api/health` stays 200 through `booting`/`failed` — a bad config must not
become a restart loop — and only answers 503 `{ ok: false, error, uptimeSeconds }` once
`health().restartRequired` is true. `health()` aggregates every module's own synchronous `health(
instance)` hook (`readiness.ts`'s `readinessFromHealth`/`livenessFromHealth`); it does no I/O and never
reflects an in-flight call's outcome, so a contended write cannot make either probe flap. Use
`/api/health` for a restart policy and `/api/ready` for load-balancer traffic.

### `GET /api/admin/schema`
One route in `layers/core/server/api/admin/schema.get.ts` answers everything the admin needs to know
about the content model, and which pipelines the caller may reach and where. It runs the preset
pipeline `adminSchemaModel` (`authn.requireUser`, `content.describeModel`,
`authz.describePipelineAccess`) through `kestrel.run` with the request headers and the client IP —
resolved by Kestrel's own `clientIp()` under the `trustProxy`/`proxyHops`/`trustedHeader` policy the h3
adapter uses, never from a raw `x-forwarded-for` — so token and rate limits are checked exactly as on
any backend route; a run with `status >= 400` is passed through with `responseForRun`, the same status,
body and headers the h3 handler produces, so `useApi()`'s `ApiError` mapping works unchanged. On
success `schemaFromRun` (`server/utils/admin-schema.ts`) joins the run's `pipelineAccess` with the
booted HTTP trigger table (`buildCapabilities`, `server/utils/admin-capabilities.ts`) and the pure
assembly (`buildAdminSchema`) answers

```
{ locales: { all, primary, prefixPrimary },
  collections: AdminCollection[],      // ordered like the model's types, each with its own capabilities
  features: Feature[],
  capabilities: Record<string, { method, path }> }  // every other pipeline the caller can reach and is not denied
```

A pipeline appears only when the booted trigger table still exposes it over HTTP and the caller passes
every `authz.require` step on it; one gated by anything else, or by nothing, still appears — the
server's own check on the actual call is the only guarantee. A pipeline a collection's verbs claim
(`collectionVerbs`, `layers/core/pipelines/capabilities.ts`) never appears in the top-level
`capabilities` map, even when it is absent from the collection's own entry. If the run ends without a
valid `pipelineAccess` — a consumer override of `adminSchemaModel` dropped the step, or a step replaced
`ctx.result` with something that is not an object — the route answers 500 instead of guessing.

Under the same response headers every backend answer carries: `cache-control: no-store`,
`x-content-type-options: nosniff` and `x-kestrel-run-id`. While Kestrel is booting or failed the route
throws the same 503 the `/api/**` handler throws — `bootFailure()` in `server/utils/boot-failure.ts`,
`{ statusCode: 503, statusMessage: "Kestrel failed to boot", data: { state, error? } }` — so both share
one shape.

`AdminSchema` and `AdminSchemaLocales` live in `layers/core/app/types/api.ts`, so the admin imports them
from `#kestrel-admin/types/api`. The model comes from the run result (the backend's own config), the UI
hints from `~~/shared/collections-ui` and `features`/`prefixPrimary` plus the fallback locales from
`~~/shared/model` — all server-side, the same way `server/plugins/kestrel.ts` imports `~~/kestrel.config`.
`layers/core/server/__fixtures__/admin-schema.json` freezes the playground's answer for an admin role
with every capability present and none denied — the fixture action tests seed `ActionDeps.capabilities`
with.

The `kestrel/admin-api-routes` ESLint rule (`playground/eslint.config.mjs`) keeps `layers/admin/app`
from growing a second, hard-coded way to reach the backend: it bans a path literal passed to the admin
API client, a hand-built `{ method, path }` route object (including one built by spreading an existing
route and overriding `path`), a raw `/api` URL outside `apiUrl()`, importing `useApi` under any name,
and calling `useApi()`, `$fetch`, `useFetch()`, `fetch()`, `globalThis.$fetch` (directly or through
`.create()`) or `new XMLHttpRequest()` directly — everything goes through
`useAdminApi()`/`useUploadTransport()` with a route from `useCapabilities()`. `useApi.ts`,
`useAdminApi.ts`, `useAuth.ts`, `useSchema.ts`, `useUploadTransport.ts`, `utils/capabilities.ts`,
`utils/admin-client.ts` and `utils/reauth.ts` are exempt, since they are the routing primitives
everything else is built on (`useAuth`/`useSchema` call `useApi()` directly rather than
`useAdminApi()`, which would import them back). Being
an AST-only rule, it does not see a bypass written as a Vue `<template>` expression (`@click="api({
method: 'DELETE', path: '/users/x' })"`), a route object assembled through a computed key
(`{ method: 'GET', [key]: '/users' }`) or `Object.assign({ method }, { path })`, or reached through a
renamed import of `$fetch`/`fetch` — the server still authorizes every call regardless, so these are a
maintenance gap, not a security one.

Three routes the admin needs before it can read a schema at all — `login`, `logout`, `me` — are fixed
regardless of the consumer's trigger list (`ADMIN_BOOTSTRAP_ROUTES`, `layers/core/fixed-routes.ts`):
`server/plugins/kestrel.ts` refuses to start unless the booted trigger table still binds them to
`POST /login`, `POST /logout` and `GET /me` (an alias next to the fixed route is fine).

A failed boot is loud: `server/plugins/kestrel.ts` logs it through the Kestrel `consoleLogger`
(`module` + `reason` from `KestrelBootError`), keeps the state observable via its exported
`getKestrelState()`, answers every `/api/*` request with 503 instead of 500, and — outside `nuxt dev` —
exits the process with code 1. The `close` hook skips `stop()` after a failed boot.

In dev, `recordBootFailure` also prints a multi-line banner (`module`, `reason`, the hint to fix
`kestrel.config.ts` and restart) through the same `consoleLogger`, one line per call, so a broken config
does not scroll off as a single JSON line among many. `layers/admin`'s `admin` layout — the layout every
admin page, including `login.vue`, renders under — calls `GET /api/ready` once on mount
(`useBootStatus`); when it reports `state: "failed"`, the layout renders a full-page notice (`role="alert"`,
the boot error, a hint to check the server log) instead of the rail and the page's own content, so a
broken backend cannot be mistaken for an ordinary login screen. There is no polling: the check runs once
per app load.

The Nitro plugin registers the image sizes declared by blocks and layers (`imageSizes` from
`#kestrel/image-sizes`) after `kestrel.start()`, by running the triggerless preset pipeline
`registerImageSizesBoot`. It imports them from `#kestrel/image-sizes`, not from `#kestrel/blocks`:
the blocks module statically imports every block SFC, and a `.vue` import inside the Nitro bundle
breaks the server build (`nuxt build`) and every dev request. `images-default` keeps code-declared sizes in memory only, so without that
call a restarted instance would only know its config/default sizes and variant URLs of declared sizes
would 404.

`layers/core`'s server utils (`server/utils/modules.ts`) identify submodules by the steps they register,
not by package name. Three places rely on this:

- The upload limit (`server/utils/limits.ts`) looks up the module that registers `media.upload`.
- The inline-SVG check (`http.inlineTypes`, `server/utils/inline-types.ts`) looks up the module that
  registers `sanitize.svg`.
- The media-paths boot check (`assertMediaPaths`, `server/utils/media-paths.ts`) looks up the modules
  that register `media.upload`, `images.attach` and `delivery.exportLlms`.

The owning module name comes from the booted instance's `kestrel.steps.owner(step)` — the real step
registry, not a pre-boot probe of each module's `steps()` factory — so all three run after
`boot()`/`kestrel.start()` resolves. Readiness (`server/utils/readiness.ts`) does not look up a step
owner at all: it reads `kestrel.health()`, the synchronous, no-I/O per-module health hook, not a probe of
any particular step. A
drop-in replacement for any of those modules works without touching `layers/core`. A configured media
module whose `maxBytes` cannot be determined — not in the entry config and not defaulted by the module's
own `configSchema` — fails the boot with a clear message instead of silently dropping the limit.

`kestrel.config.ts` (triggers, module config, and the exported `preset` from `definePreset` — see
**Pipeline presets**) is a consumer file at the app root. `kestrel.modules.ts` and `pipelines/index.ts`
are optional consumer files; `server/plugins/kestrel.ts` imports the module list and the pipeline list
through two aliases instead, `#kestrel/consumer-modules` and `#kestrel/consumer-pipelines`
(`layers/core/modules/consumer-entries`), each resolved once at Nuxt startup: to the consumer file when it
exists at the app root, else to a default in `layers/core` — `presetModules(config.modules)` (see
**Module registry**) for modules, `preset.pipelines` unchanged for pipelines. The same module resolves
`#kestrel/consumer-block-tags` to the optional `shared/block-tags.ts` (block tag labels for the admin
picker), `#kestrel/consumer-admin-i18n` to the optional `shared/admin-i18n.ts` and `#kestrel/field-types`
to the optional `shared/field-types.ts` (consumer-declared field types, see `docs/field-types.md`),
each to an empty map when the file is absent. All of them stay statically imported either way, so Nitro and Vite bundle them
without dynamic loading and without "import is undefined" warnings. `http: null` — Kestrel serves through
Nitro's `server/api/[...].ts`, not its own listener. Data lives in the consumer's `./data` (SQLite +
blobs), git-ignored.

Creating or deleting `kestrel.modules.ts`/`pipelines/index.ts` while the dev server is running needs a
restart — the exists-else-default check runs once, in the Nuxt module's `setup()`.

Because `kestrel.config.ts` is bundled into the Nitro server, neither the process cwd nor
`import.meta.url` points at the app any more, and a built `.output` must not depend on the build machine's
paths. `layers/core/modules/schemas` therefore bundles the JSON Schemas: its template `#kestrel/schemas`
lists the schema *paths* in dev (the generated `<buildDir>/kestrel/pages.body.json`, the consumer's
`schemas/*.body.json` and `schemas/settings.navigation.json` when present, else the layer defaults) and, on
`nitro:build:public-assets`, is rewritten with the schemas *inlined*. The Nitro plugin passes them through
`applyBundledSchemas` (`server/utils/bundled-schemas.ts`), which swaps the matching keys of the
`validate-jsonschema` module config before boot — so `presetSchemas`' path defaults only matter outside
Nuxt. `process.env.KESTREL_APP_ROOT` is replaced in the dev bundle only (with the app root); a production
server reads it from the environment and falls back to the process cwd (it decides where `data/export`
and the `here()` helper of a config resolve).

IP allowlists: `server/plugins/access.ts` parses `runtimeConfig.kestrel.access` (`admin`, `site`,
`trustProxy`, `proxyHops`, `trustedHeader`, `trustedProxies`) into `net.BlockList`s and the core's
`clientIpResolver` at start (an invalid entry throws); `server/middleware/ip-allowlist.ts` calls `guardAccess`
(`utils/ip-allowlist.ts`) for every request. It maps the request to a scope with `accessScope` (admin UI,
admin/account API and all API writes are `admin`, everything else `site`), classifying `routedPath`: the
path with dot segments resolved and each segment decoded, which is the path the API adapter routes, so
`/api/x/../users` is judged as `/api/users` (the adapter itself answers 400 to it). It answers 403 when a
trusted proxy sent the request without the configured trusted header, or when the scope has a list and the
client address is not in it; a `GET` of `/api/health` or `/api/ready` without the trusted header is judged
by the peer address instead and answered with `{ ok }` or `{ ready }` alone (`probeBody`). A request whose
forwarding header was ignored because the peer is not a trusted proxy is logged through the core's
`forwardingWarner`, once per peer and hour. The address is the core's: the socket peer, and only when that peer is in
`trustedProxies` (default loopback; a Unix socket counts as loopback) the trusted header or the
`X-Forwarded-For` entry `proxyHops` from the right. The same resolver feeds `ctx.ip` through the API and
`/media/**` handlers. Only Nitro's in-process `localFetch` (SSR, publishing, static delivery) passes
unchecked, recognized by its mock socket; the `nuxt dev` server does not enforce the lists. IPv4-mapped IPv6
addresses are checked as IPv4. Nitro serves the hashed `/_nuxt/*` build assets before server middleware runs, so those stay
reachable even with a closed `site` list — they carry no content.

## Consumer contract
An app that extends `kestrel-web` provides, at its root:

| file | purpose |
|---|---|
| `kestrel.config.ts` | `defineConfig({ modules, triggers, http: null })` — the backend's module config and HTTP-trigger routing; also exports `preset` (`definePreset({ modules, features, collections, ...pipelineChanges })`, see **Pipeline presets**; the same `pipelineChanges` go to `presetModuleConfig({ pipelines })`). The `modules` list comes from `presetModuleConfig()` (see **Consumer module config**); writing it out by hand stays supported. |
| `kestrel.modules.ts` *(optional)* | The module *implementations*, one per entry in `kestrel.config.ts`'s `modules`, same order. Needed only when a `modules` entry isn't a standard `@michaelthielemann/kestrel-*` package — see **Module registry**. |
| `pipelines/index.ts` *(optional)* | Exports `pipelines`, the list of pipeline definitions referenced by `kestrel.config.ts` triggers — `[...preset.pipelines, ...ownPipelines]`. Needed only once you have pipelines of your own. |
| `shared/model.ts` | The content model — `locales`, `defaultLocale`, `prefixPrimary` (whether public URLs prefix the default locale too — the backend never does), `contentTypes` — and `features`, the `Feature[]` list passed to `definePreset`/`presetSchemas`/`presetCollectionsUi`. Backend config: consumed by `kestrel.config.ts`, by `shared/collections-ui.ts` and, server-side, by the `GET /api/admin/schema` route (so backend and admin UI can't drift). The admin browser bundle does not import it. |
| `shared/collections-ui.ts` | The admin UI for each collection: labels, icon, editor, field layout/labels/overrides, and the optional `workflow`. `defineCollectionsUi({ ...presetCollectionsUi({ features }), ...ownEntries }, contentTypes)`, see **Collection UI**. |
| `shared/field-types.ts` *(optional)* | Field types of your own: `defineFieldTypes({ color: { storage, schema, empty } })`. Passed to `presetModuleConfig`/`definePreset` as `fieldTypes`, read by the blocks module at build time and by the admin through `#kestrel/field-types`. See `docs/field-types.md`. |
| `app/blocks/*.vue` | One SFC per block. Its `defineProps({ … field factories … })` IS the block schema and its `defineBlock({ … })` the block metadata; the file name is the block name. No registry, index or definitions file. |
| `migrations/*.ts` *(optional)* | One `defineMigration({ id, collection, up })` per file, collected sorted by filename into `#kestrel/migrations` (`modules/migrations`, directory configurable via `kestrel.migrationsDir`). Needed only with the `migrations` feature on. |

## Consumer module config
`layers/core/pipelines/config.ts` (`presetModuleConfig`, re-exported from `#kestrel/pipelines`) builds a
`kestrel.config.ts` `modules` list from `{ dataDir, blobstore, model, features, roles, bootstrap, media?,
ratelimit?, llms?, migrations?, session? }`. It emits the base modules plus exactly the modules the given
features require — the same feature→module mapping `definePreset` checks (`pipelines/features/*.ts`) — in
the canonical order, and derives from the model what is derivable: `media.locales`/`defaultLocale`,
`references.targets` (media, every multi collection and every `ref` field's `to`; the references feature
wires check/index/guard/unindex into every generic multi collection and a re-index after every single
collection's write group, right before its emit), `references.schemas`
(the `json` field schemas from `presetSchemas()`; the block schema marks media and relation fields with
`x-kestrel-ref`), `delivery.types` (every
routed collection), `site-default`'s `routes`, `validate-jsonschema.schemas` via `presetSchemas()`, `publicPath` on
both media modules from `MEDIA_PUBLIC_PATH`, and, with `delivery`, `publicCopy: { prefix }` on both from
`SITE_PREFIX`. Both constants live in `layers/core/mount-path.ts` (`MEDIA_PUBLIC_PATH`) and
`pipelines/config.ts` (`SITE_PREFIX`), shared with `server/plugins/kestrel.ts` and the media-paths boot
check — nothing can drift. `authz-roles` gets `roles` and `anonymous` as given and `anonymousFields`
derived from the model and the features (see **Public reads and field grants**).

`layers/core/config/` (`#kestrel/config`) is the environment half, deliberately free of preset types:
`kestrelDataDir()`, `requiredEnv(name)`, `adminPasswordHash()` and `envBlobstore(dataDir)`. Production
without `KESTREL_ADMIN_PASSWORD_HASH`, or an S3 blobstore without its variables, throws while the config
loads, naming the variable. `playground/kestrel.config.ts` uses `kestrelDataDir()` with a literal
filesystem blobstore and the development hash, so building and previewing the playground needs no
environment.

## Module registry
`layers/core/module-registry/` is the `#kestrel/modules` public API: `moduleRegistry` (every standard
`@michaelthielemann/kestrel-*` package's default export, keyed by its package name) and
`presetModules(modules, extra?)`, which maps `kestrel.config.ts`'s `modules` list to implementations, in
the same order, looking each `use:` name up in `extra` first, then `moduleRegistry`, throwing naming the
`use:` value when neither has it. `layers/core/nuxt.config.ts` aliases it as `#kestrel/modules`, the same
mechanism as `#kestrel/pipelines`. `layers/core/modules/consumer-entries` (see **Runtime**) is the only
built-in caller — its default `#kestrel/consumer-modules` fallback is `presetModules(config.modules)`
with no `extra`, so it only ever resolves standard packages; a consumer with a non-standard module keeps a
`kestrel.modules.ts` that calls `presetModules` itself, passing that module through `extra`.

## Pipeline presets
`layers/core/pipelines/` (`index.ts` — the `#kestrel/pipelines` public API: `definePreset`,
`presetSchemas`, `presetModuleConfig`, `Feature`; `config.ts` — the module-config builder, see
**Consumer module config**; `base.ts` — the always-on pipelines (auth including `adminSchemaModel`
(`authn.requireUser`, `content.describeModel`), which has no trigger and is run by the
`GET /api/admin/schema` Nitro route, `getSettings`/`setSettings`, media
including the nightly report-only `reconcileMedia` and its two admin routes `reconcileMediaReport`
(`POST /admin/media/reconcile`) and `reconcileMediaDelete` (`POST /admin/media/reconcile/delete`,
`media.reconcileDelete` — the deletion is in the pipeline, not in the request body), plus `resolvePage`
when `pages` is in `collections`); `collections.ts` — generates a `multi` or `single`
collection's CRUD pipelines and HTTP triggers from its name and `kind`/`fields`; `features/*.ts` — one
factory per feature; `triggers.ts` — the canonical, feature-tagged, collection-independent trigger list
(auth, `settings`, `redirects`, `site/*path`, media, cron/event); `compose.ts` — the
patch/override/exclude/schedule mechanics, including the `after` anchor a step uses to sit directly
behind another) ships every standard pipeline, its HTTP/cron/event triggers,
and the `<name>.body`/`redirects.rules` JSON-Schema paths as one preset. `layers/core/nuxt.config.ts`
aliases it as `#kestrel/pipelines`, the same mechanism as `#kestrel/blocks`, so a consumer's
`kestrel.config.ts` and (optional) `pipelines/index.ts` can import it.

`definePreset({ modules, features, collections?, collectionsUi?, overrides?, exclude?, schedules?, exportDir?, homeSlug? })`
composes pipelines in this fixed order:

1. Base pipelines.
2. Collection-derived pipelines (`collections.ts`, one `multi` or `single` CRUD set per entry in
   `collections`; `settings`/`redirects` are excluded here since they're already in base/the `redirects`
   feature).
3. Feature patches, in this feature order — `ratelimit, sanitizeSvg, references, links, delivery,
   redirects, images, replication, migrations, audit, insights, eventsQueue, revisions` — and, within
   one feature, in the order its patches are declared.
4. The emit fold and the relay (§ Events and the relay), then the field step on every public read
   (§ Public reads and field grants).
5. `overrides`.
6. `exclude`.
7. `schedules`.

Each feature also names the module(s) it needs; a feature without its module throws at compose time, a
configured module whose feature is off only warns (the consumer may still use the module with pipelines
of its own).

`definePreset<C, S extends string = PresetStep>(options: PresetOptions<C, S>)` types `overrides`'s step
lists against `S`, which defaults to `PresetStep` (`module-registry/index.ts`) — the union of every step
name a registered module's `describe()` declares. A misspelled step in an `overrides` list fails
`nuxt typecheck`, not just boot; a consumer adding a module outside `moduleRegistry` widens `S` explicitly
(`definePreset<typeof contentTypes, PresetStep | "my-module.myStep">`) so the preset's own step names stay
checked alongside the addition.

`collections` defaults to `{ pages: <the built-in pages shape> }` when omitted, so a consumer that passes
none gets the `pages` pipelines and triggers. `pages` is the one collection name the generator
special-cases (`layers/core/pipelines/collections.ts`'s `NAME_OVERRIDES`): every other `multi` collection
uses its own name for every pipeline (`listNews`, `readNews`, `createNews`, …), but `pages` uses
singular forms (`readPage`, `createPage`, …) and event names (`page.created`, not
`pages.created`), so overrides, triggers and listeners written against those names keep working. A routed
collection — `pages`, and every multi collection declaring `mount: true` (`capabilities.ts`'s
`isRoutedCollection(name, model)`) — also gets the path index steps, the links feature patches
and the `delivery` feature's own publish/unpublish event pipelines (`publishPage`, or `publish<Name>` for a
mounted collection, `delivery-names.ts`'s `routedPipelineNames`); `pages` gets `resolvePage`, a mounted
collection `resolve<Name>`. Every other collection's pipelines are untouched by those features.

A `multi` collection with at least one `localized: true` field (`collections.ts`'s `hasLocalizedField`)
additionally gets `delete<Name>Translation` (`authn.requireUser`, `authz.require:<name>.write`,
`content.removeTranslation:<name>`, `events.emit:<event>.translationRemoved`) and
`DELETE /<name>/:id/translations/:locale`, so a single locale's fields can be cleared without removing
the document — the backend answers 409 when it is the last remaining translation.

`triggers.ts` holds one ordered list, each entry optionally tagged with the feature that gates it;
`definePreset` filters it by the enabled features, splices the `pages` collection's 7 routes in right
after `resolvePage`'s (reproducing their original position exactly) when `pages` is in `collections`,
appends every other collection's routes at the end, and the consumer appends its own triggers after
that. List order itself is not load-bearing for route resolution: Kestrel matches HTTP triggers by
specificity, not declaration order (`core/src/triggers/http.ts`'s `sortRoutes`/`bySpecificity` — literal
segment beats `:param` beats end-of-route beats `*rest`), so `GET /admin/references/to/pages` always
wins over `GET /admin/references/to/pages/:id` regardless of where either is registered. Two triggers
that resolve to the same method-and-pattern are a boot error (`boot.ts`), not a silent override — the
list order only matters for readability and for where a route logically belongs among its feature group.

`golden.test.ts` pins the pipeline and trigger lists that `definePreset` composes against frozen fixtures
— a mismatch is a bug in the preset, not a fixture to update.

### Atomic groups

A generic collection's `create`/`update`/`delete`/`delete<Name>Translation` pipeline wraps its
`content.*` write in `{ atomic: [...] }`: the runner commits every step of the group or none of it. The
group starts as just the content write; `references`, `links` and `revisions` insert their own steps
into it by anchor the same way they patch any other step. `delivery` no longer touches a page write
pipeline at all — `delivery.publish`/`delivery.unpublish` run in the separate `publishPage`/
`unpublishPage` event pipelines the `delivery` feature registers, triggered by the events a write
pipeline emits (§ Events and the relay, below). A pipeline's step list therefore nests one level in
places: `PresetEntry` is a step name or `{ atomic: readonly PresetEntry[] }`, and
`@michaelthielemann/kestrel/definePipeline`'s `pipelineSteps()` flattens it back to a plain list wherever
only the order matters (golden fixtures, `status-filter.ts`, the admin's insights graph).

`compose.ts`'s anchors work the same inside a group as outside it — an anchor that names a step inside
the group inserts inside it — plus one reserved anchor, `ATOMIC_END`, meaning the group's own boundary:
`{ at: "before", anchor: ATOMIC_END }` appends to the group, `{ at: "after", anchor: ATOMIC_END }` inserts
right after it. A pipeline with no group, or with more than one, makes `ATOMIC_END` a compose-time error.

With the `eventsQueue` feature, `definePreset` folds each pipeline once, after every feature patch and
`derive()`: if a pipeline's last entry is its `events.emit:` step and it has exactly one atomic group,
the emit — and only the emit — moves to the end of that group. Nothing between the group and the emit
moves with it, `revisions.reportRestore` included; that ordering no longer carries the caveat it once did
— `delivery.publish` has left the pipeline, and every step that adds to the response now merges via
`extendsOutput` regardless of order. This is why `deleteUser` gets a group only with the queue enabled:
the delete itself is already a single step, but the queue's write and the `user.deleted` event row now
commit or roll back together for the two shipped subscribers (`anonymizeAuditUser`,
`reassignRevisionAuthor`).
Every other single-write pipeline (`createUser`, `updateUser`, `setSettings`, `uploadMedia`, …) keeps no
group in both delivery modes: none of them has a shipped event subscriber whose loss would need
undoing, and a consumer who adds one overrides that pipeline with its own group.

### Events and the relay

Every preset pipeline that ends in an `events.emit:` step — after the fold above, with the queue, or bare
without it — additionally ends in `events.relay` (`appendRelay` in `compose.ts`, wired unconditionally in
`index.ts`'s fold pass, after every feature's patches and `derive()`). The relay is not gated by
`eventsQueue`: both delivery modules register the step, so the composed pipeline list and the response
shape are the same regardless of mode — only whether the emit sits inside an atomic group differs.
`events.relay`'s own `describe()` never declares `atomicSafe`, so kestrel's boot rejects any attempt to
put it inside a group; it always runs after the group's commit. `atomic-safe.ts` does not enforce this —
it is a local list of every step this layer's shipped modules do declare `atomicSafe` for, which
`boot.test.ts` asserts against the booted manifest so the list cannot drift from what those modules
actually declare; `events.relay` is correctly absent from it.

`appendRelay` inserts the step immediately after the entry carrying the emit — the emit itself when bare,
or the atomic group it ends when folded — not necessarily at the very end of the pipeline: `restorePageRevision` ends
`…, revisions.reportRestore` after its group, because `revisions.reportRestore` reads the group's result
outside the group and `restorePipeline`'s composition (`features/revisions.ts`) is otherwise unchanged;
the relay sits between the group and that trailing step, which is correct because both only add
independent members to the result.

`delivery` (`features/delivery.ts`) contributes `publishPage` (`delivery.publish:pages`,
`delivery.requestLlms`) and `unpublishPage` (`delivery.unpublish:pages`, `delivery.requestLlms`) as plain
event pipelines with no relay of their own — they run as the payload of another pipeline's relay — and
five event triggers tagged with the `delivery` feature: `page.created`/`page.updated`/`page.restored`/
`page.translationRemoved` (the last one only when `context.pagesTranslatable`) → `publishPage`,
`page.deleted` → `unpublishPage`. Its dependents pipelines and their triggers are described under "Dependent
re-rendering" below.

An `overrides` entry for a pipeline that had a group is rejected at compose time if it drops the group
around the `content.*` write — a flat replacement loses atomicity silently otherwise. The override may
reorder or extend the group, or add unrelated steps around it; it may not remove it. A consumer who
genuinely wants no transaction must `exclude` the pipeline and define it from scratch.

Two pipelines are exempt on purpose: `replicationRestore` replaces the database file, which cannot be
inside a transaction of that same database, and `deleteMediaFolder` has a check-then-act window between
its reference guard and the blob removal that no database scope closes — closing it needs a different
mechanism than grouping and is tracked separately.

### Public reads and field grants

Which fields of an answer a caller receives is `authz-roles`' decision: its step
`authz.fields:<resource>?shape=<item|list|array|file>`, last in a pipeline, cuts the answer to the fields
`anonymousFields[<resource>]` grants a caller without a session (a signed-in caller keeps everything unless
every one of its roles has a grant in `fields`). kestrel refuses to boot when a pipeline an anonymous caller
reaches over HTTP does not end with the step, when its resource has no anonymous grant, or when a grant
names a field no pipeline of that resource declares.

After the relay pass, `definePreset` appends the step (`field-grants.ts`, `fieldCutSteps(collections)`) to
every read an anonymous caller can reach, whether or not the consumer's `anonymous` permissions grant it
today, so that granting `<name>.read` later needs nothing else:

| Pipelines | Step |
|---|---|
| `resolvePage`, `readPage` | `authz.fields:pages?shape=item` |
| `listPages` | `authz.fields:pages?shape=list` |
| `getSettings` | `authz.fields:settings?shape=item` |
| `getMedia` / `listMedia` | `authz.fields:media?shape=item` / `?shape=list` |
| `downloadMedia`, `serveMediaFile`, `serveImageVariant` | `authz.fields:mediaFile?shape=file` |
| `renderRedirects` | `authz.fields:redirectRules?shape=array` |
| `getRedirects` | `authz.fields:redirects?shape=item` |
| each collection's `list<Name>`, `read<Name>`, `get<Name>` | `authz.fields:<name>?shape=list` / `item` / `item` |

The step therefore follows `images.attach` and `redirects.lookup`. An override replaces the step list whole
and keeps the step only when it names it; one that drops it from a public read fails boot, naming the
pipeline.

`presetModuleConfig()` derives the anonymous grants from the content model, the features and
`roles.anonymous` (`anonymousFieldGrants(model, features, anonymous)`), for each resource whose read
permission `anonymous` holds (`<type>.read`, `media.read` for `media` and `mediaFile`, matched as
`authz-roles` matches) and for the ungated redirect rules: every model field of each content type with its `id`, plus
`_locales` and `_translations` when the model has locales; on `pages` also `_locale` (with locales),
`_links` and, with `redirects`, `redirect` (the hit `resolvePage` can answer early); on `settings` also
`_links`; the public media fields (`id`, `path`, `filename`, `contentType`, `size`, `width`, `height`,
`alt`, `title`, `description`, `provenance`) and, with `images`, `variants[].size`, `.width`, `.height`,
`.format` and `.path`; the file headers `cache-control`, `x-content-provenance` and, with `images`,
`x-kestrel-variant`; with `redirects`, the redirect rules' `from`, `pattern`, `target` and `status`. It names only
members a read declares, so every path passes kestrel's check. What it leaves out is cut for anonymous
callers: a document's `createdAt` and `updatedAt`, a media item's `folder`, timestamps, `available` and
`variantCounts`, a variant's `bytes` and `state`, any other file header, and — on every collection,
unconditionally — a field named `blockAliases` (see "Page builder"). `roles.anonymousFields`
replaces the grant of a resource it names (an empty list removes it), and `roles.fields` is passed through.

`presetModuleConfig` also takes the `exclude` and `overrides` the consumer gives `definePreset`, as its
`pipelines` option, and derives no grant for a resource whose every preset read they exclude or override
without its cut (`presetCutResources` in `field-grants.ts`; a read whose feature is off counts as absent).
The derivation is a pure function of its options: `definePreset` never touches the module list, so cloning
it or composing several presets from it is safe. kestrel refuses a grant whose resource no pipeline cuts;
when a consumer passes different changes to the two functions, that refusal is the result, and the Nitro
plugin adds to it (`server/utils/field-grant-hint.ts`) that both functions need the same `exclude` and
`overrides`. The template and the playground keep them in one `PresetPipelineChanges` object passed to
both. A consumer pipeline that cuts a resource whose preset reads are all excluded needs that resource in
`roles.anonymousFields`; `preset/field-grants` in the upgrade tool reports both cases before boot.

## Content migrations
A consumer that changes a block's props or a collection's field shape needs existing documents rewritten,
not just new ones written correctly — the `Migration` type and the helpers (`defineMigration`, `mapBlocks`,
`renameBlock`, `renameProp`, `omit`) come from `@michaelthielemann/kestrel-contracts/migrations` and
`@michaelthielemann/kestrel-migrations-default/helpers` (server-side packages, never imported by client code),
and `modules/migrations`
(the `#kestrel/migrations` discovery module, same `addTemplate`/`builder:watch` mechanism as
**Block discovery**, collecting `<rootDir>/migrations/*.ts` sorted by filename, directory configurable via
`kestrel.migrationsDir`) are `layers/core`'s half of this; applying the migrations to the database — the
ledger, the boot-time `apply`/`check`/`off` modes, `mapBlocks`/`renameBlock`/`renameProp`/`omit` helpers —
is `@michaelthielemann/kestrel-migrations-default` (contract `migrations@1`), a standard module like any
other feature's. The `migrations` feature (`features/migrations.ts`) only adds `listMigrations` and
`applyMigrations` (`GET /admin/migrations`, `POST /admin/migrations/apply`, both
`authz.require:migrations.manage`) — it does not itself know how migrations run. See
`docs/consuming-kestrel-web.md#10-optional-schema-evolution--migrations`.

## Content model
`shared/model.ts` exports `contentModel` (locales, types) for the backend module config and the typed
field list for the UI. `serializeCollections` (`layers/core/collections-ui/serialize.ts`) turns it into
the `SerializedCollection` shape (labels, icons, editor body, layout rows) that the generic editor, list
and field renderer read; the admin gets the result over
`GET /api/admin/schema`, not from a build-time import. Mapping: `enum → choice`, `ref(media) → media`, `ref(x) → relation`,
`date → datetime` (ms epoch on the wire), everything else 1:1. Enum choice labels and relation
`labelField` are consumer-owned (see **Collection UI**) — kestrel-web carries no consumer collection,
field or enum name.

## Collection UI
`layers/core/collections-ui/` is the `#kestrel/collections-ui` public API: `CollectionUi` (labels, icon,
editor, `fieldLayout`, `fieldLabels`, `editorOwned`, `fieldOverrides`, `placement`, `nav`),
`defineCollectionsUi(map, collections?)` (a shape guard, including `placement` and `workflow`) and `presetCollectionsUi({ features })`,
which returns the `settings` entry always — including a `navigation` repeater fieldOverride
(`label`/`link`/`target`, plus one nested `children` repeater) — and the `redirects` entry (with its
`rules` repeater fields) only when the `redirects` feature is on; both with `placement: "system"` set.
`placement` (`"rail" | "system" | "account"`, default `"rail"`) decides where `serializeCollection`
(`layers/core/collections-ui/serialize.ts`) puts a collection in the admin — `AdminNav.vue`
filters the rail on `placement === 'rail'`, `pages/admin/system.vue` builds its tab list from every
`placement === 'system'` `single` collection (settings first, then the rest in model order, then the
fixed feature tabs — including the Events tab from the `eventsQueue` feature), `pages/admin/index.vue`'s dashboard cards link `"rail"` to the list and `"system"`
to the tab (skipping `"account"` cards), and `AdminAccount.vue`'s rail-foot menu lists every
`placement === 'account'` collection. `nav: false` still opts a `"rail"`-placed collection out of the
rail link and dashboard card. An invalid `placement` value throws, in both `defineCollectionsUi` and
`serializeCollection` (a consumer can build a `CollectionUi` map without going through
`defineCollectionsUi`, e.g. in tests). The `Repeater` field component nests to any depth, and row-level
validation errors follow the same nesting. A consumer's `shared/collections-ui.ts` spreads the preset and adds its own collections, e.g. `pages`.
The merge and validation live in `layers/core/collections-ui/serialize.ts`
(`serializeCollections(contentTypes, ui, routing)`), exported through `#kestrel/collections-ui`, and
`server/utils/admin-schema.ts` (`GET /api/admin/schema`'s route) is its only real caller; a consumer
never calls it directly. `SerializedCollection` carries `editorOwned` and `workflow` alongside the
fields, so a client needs no second look at the UI map. It also carries `routed`, `published` and
`hasSlug`, decided in one place (`admin-schema.ts`, from `collectionVerbs`/`isRoutedCollection` in
`#kestrel/pipelines`) instead of from the collection's field shape: `routed` is
`isRoutedCollection(name, model)`, the single place that decision lives, with the `mount` flag read from the
preset's model since the stored model does not carry it; `published` is true when the
collection's `publishStatus` pipeline both exists and has a booted HTTP trigger, independent of the
calling user's access; `hasSlug` is a plain `"slug" in fields` check for the list's slug column.
`serializeCollection`/`serializeCollections` take the `routing` map as a required parameter, so a caller
must decide it rather than silently getting `routed: false, published: false` for every collection.
`validateReservedFields` requires `title` and `status` on a collection that is `routed` or `published`,
not merely on one that carries a `slug` field. Enum choice labels come from
`fieldOverrides.<field>.options.choices` (matched by value): every model value needs a matching choice,
and every choice's `value` must be one of the model's `options` — either mismatch throws. A relation's
`labelField` comes from `fieldOverrides.<field>.relation.labelField` (a partial override — `collection`
and `many` still come from the model), else the target type's first `text` field, else `'title'` — and
that resolved name must exist on the target type or serialization throws. Field-level overrides are
deep-merged one level into the generated field (`options` and `relation` merge rather than replace) so a
partial override like `{ options: { from: 'title' } }` or `{ relation: { labelField: 'nick' } }` keeps
generated keys. A UI entry for an unknown collection, or `fieldLayout` (checked recursively into
`LayoutGroup` rows) / `fieldLabels` / `fieldOverrides` / `editorOwned` naming a field the content model
lacks, throws at collection-serialization time, naming the collection and field; `options.from` is
checked for every field of type `slug`, not only one literally named `slug`.

`workflow` (`{ field, live, draft, done? }`) names the field and the values that drive the admin's status
light, publish button and the public-site filter. `resolveWorkflow(name, model, ui)`
(`collections-ui/workflow.ts`, re-exported from `#kestrel/collections-ui`) returns the declared
`CollectionUi.workflow` when there is one, else derives the conventional
`{ field: "status", live: "published", draft: "draft", done: "finished" }` from a `status` field: a
`status` enum listing `draft` and `published` gets it (with `done` only when `finished` is among the
options), a `status` field whose definition carries no options at all (the placeholder shape of
`DEFAULT_COLLECTIONS`) gets it unconditionally, and anything else gets no workflow. `defineCollectionsUi`
checks a declared workflow against the model when it is given one: the field must exist and be
`type: "enum"`, and `live`/`draft`/`done` must be among its `options` — the error names collection and
field. Declaring a `workflow` without passing the content types throws: `defineCollectionsUi(map)` cannot
check it, so it demands `defineCollectionsUi(map, contentTypes)`. A declared workflow also relaxes the
reserved `status` check in `collections-ui/serialize.ts`: a collection that names its own values
(`workflow: { field: "status", live: "live", draft: "entwurf" }`) is validated against the workflow
instead of against `STATUS_VALUES`; `status` still has to be `type: "enum"`.

### The status-filter boot guard
The workflow decides what the public `list`/`read` pipelines filter on, so it has to reach
`definePreset` as well — a consumer that declares a `workflow` in `shared/collections-ui.ts` but forgets
`definePreset({ collectionsUi })` would serve drafts anonymously. `server/utils/status-filter.ts` is the
pure check (`contentCollections`, `statusFilterProblems`, `statusFilterFailure`): for every generic
`multi` collection it resolves the workflow from the content module's own model plus
`~~/shared/collections-ui` — the same inputs the schema route uses — and compares the resulting
`content.list:<name>`/`content.get:<name>` step of `list<Plural>`/`read<Singular>` against what
`#kestrel/consumer-pipelines` actually carries. A pipeline that is absent (excluded) or no longer runs
that step (overridden) is skipped. `server/plugins/kestrel.ts` runs it right after `kestrel.start()` and
before the state flips to `ready`, so a mismatch fails the boot through `recordBootFailure` with the
collection, the expected filter and the fix in the message.

## Admin client layer
- `app/composables/useSchema.ts` — the one place the admin learns what it is editing, and what it is
  allowed to do. It holds `GET /api/admin/schema`'s answer in `useState('kestrel-schema')` as
  `{ schema, error, generation }`: `load()` returns `"ok"` straight away when a schema is already in the
  state, and concurrent calls share one in-flight request. `clear()` bumps `generation` and empties the
  state; an in-flight `load()` started before a `clear()` checks `generation` before writing, so it
  cannot resurrect a previous caller's schema. `refresh()` is `clear()` followed by `load()`. The
  `admin-auth` middleware calls `load()` after a successful session check, and `login.vue` after a
  successful login (`useAuth().login` clears first, since the schema is caller-specific). A 401 answers
  `"unauthenticated"` and nothing else happens there — `useAdminApi()`'s own reauth interceptor
  (`utils/reauth.ts`, built into the `$fetch.create()` instance that every `useAdminApi()` call shares
  its construction with) already resets the session and navigates to login for any 401, so the
  middleware would only add a second reset and a competing navigation. Any other failure answers
  `"failed"` and keeps its message in the state: the admin layout then renders `BootFailure.vue` with it
  instead of the page, the same treatment a failed backend boot gets. The schema is never cached across
  callers: `useAuth().reset()` (logout, the 401 interceptor) clears it, `checkSession()` clears it when
  the session answers a different identity than before, `useAuth().refreshAccess()` (own user edited)
  clears and reloads it, and the reauth interceptor's `schemaStaleAfter()` triggers a background
  `refresh()` on a 403 from any kestrel route other than the schema route itself.
- `app/utils/collections.ts` — the pure readers over that answer: `collections(schema)`,
  `findCollection(schema, name)`, `editorOwnedFields(schema, name)` (appends `LAYOUT_FIELD` when the
  collection has one) and `contentLocales(schema)`. They take the schema as a parameter and answer empty
  while none is loaded, so they stay unit-testable and actions can be handed schema data through their
  input instead of calling a composable. `useCollections()`, `useFeatures()` and `useContentLocales()`
  are the thin composable clients on top. They all answer computed refs — `useContentLocales()` returns
  `{ locales, primary, prefixPrimary }` as `ComputedRef`s, not a snapshot — because the schema arrives
  after a component's setup has run and a value read at setup time would stay empty forever.
- Workflow: a collection's `workflow` (`{ field, live, draft, done? }`, see **Collection UI**) is the only
  source of publish state in the client. `EditorStatus.vue` colours the light by comparing the saved
  status against `workflow.draft`/`workflow.done`/`workflow.live`, `pages/admin/[collection]/[id].vue`
  writes `workflow.live`/`workflow.draft` from publish/unpublish, `actions/list.ts`'s `bulkSetStatus`
  takes `{ workflow, live }` and writes `{ [workflow.field]: live ? workflow.live : workflow.draft }`, and
  `CollectionListTable.vue` reads the status cell from `workflow.field`. A collection without a workflow
  gets no status light, no publish button and no bulk status actions rather than writing a value its model
  does not know.
- `app/composables/useApi.ts` — the HTTP client for JSON requests; errors become
  `ApiError { status, code, retryable, message, runId, step?, details? }`. `retryable` is `true` for a `503`
  (with a `Retry-After` header) or `429`; the UI offers a retry and names the `Retry-After` seconds when
  present (`editor.retryable`).
- `app/composables/useUploadTransport.ts` — the one exception to `useApi.ts`: the multipart
  `POST /media` upload, which needs `upload.onprogress` (`$fetch` has none). An `XMLHttpRequest`-based
  transport with the same Bearer token source as `useApi.ts` and the same `ApiError` mapping for a
  non-2xx response or a network error, plus a `{ loaded, total, percent }` progress callback. Used only
  by the `upload` action's `upload.request` step (**UI actions**).
- `app/composables/useAuth.ts` — login/logout/me/change password/`refreshAccess()` (own-role change);
  gating goes through `useCapabilities()` (`has(pipeline)`/`hasVerb(collection, verb)`), not a role
  table.
- `app/utils/admin-client.ts` (`installAdminClient()`, called once from the admin layout, never a Nuxt plugin: plugins land in the client entry of every page, so the public site would carry admin code and CSS) — in dev, installs the style guard that hides foreign stylesheets under `/admin`. The reauth interceptor (403 refetches the schema, 401 clears the session and redirects to login) lives in `useAdminApi()` itself, not here — see below.
- `app/composables/useEditForm.ts` — load one document in one locale (`?locale=`), dirty tracking, undo/redo;
  saving and status changes are delegated to the actions below. `canSave` is what the Save button and
  every submit path read: a stored, unchanged record cannot be saved (the button is `disabled`, carries
  `title`/`aria-describedby` "No changes to save", and `CollectionEditor.onSave` returns early, so a form
  submit from anywhere is a no-op). A record that does not exist yet (`new`, or a singleton the backend
  answers `NOT_FOUND` for) and a locale whose translation is still missing stay saveable, because saving
  is what creates them. Publish/unpublish go through `setStatus` and are unaffected, and a restore or a
  locale switch re-baselines, so neither leaves the form falsely dirty. `missingTranslation` drives
  `CollectionEditor.vue`'s translation-copy banner (`TranslationCopyBanner.vue`, placed above the
  field/blocks body so it renders for either editor kind), whose source picker defaults to the primary
  locale when translated, else the first translated locale from `_translations`. The copy itself runs
  through the `copyTranslation` action (**UI actions**), which writes only `localized: true` fields into
  the form via `setField`, so the record stays dirty and unsaved until the editor submits.
- On a translatable `multi` collection with more than one remaining translation, the delete dialog
  (`CollectionDeleteDialog.vue`'s `translation` prop) offers deleting only the current locale
  (`deleteTranslation`, **UI actions**) next to deleting the whole document, and lands the editor on the
  default locale afterwards if that one survives, else the first remaining one. On the last translation it
  offers only the whole-document delete, with a note explaining why.
- `app/actions/` — the declared step sequences behind every user-triggered write, see **UI actions**.
- `app/composables/useMediaLibrary.ts` — media list and folder tree from `GET /media/folders` (persistent,
  including empty folders and implied ancestors), plus selection and navigation state.
- Folder create/rename/move/delete, file rename/move, upload, and per-file meta/provenance edits are
  declared actions in `app/actions/media.ts` (`createFolder`, `renameOrMove`, `deleteItems`, `upload`,
  `setMediaMeta`, `setMediaProvenance`), called directly with `runAction` from `MediaLibrary.vue` and
  `useMediaUpload.ts` — see **UI actions**. Folder ops go through `POST|PATCH|DELETE /media/folders` (one
  request per folder, no per-item loop); file rename/move stays `PATCH /media/:id`. On disk a file's blob
  key is `<folder>/<filename>` (no folder → `<filename>`), so a folder rename moves every blob under it.

### UI kit first
`layers/admin/app/components/ui/` is the admin UI kit. Admin components, layouts and pages use it instead of raw
`<table>`, `<button>`, `<input>`, `<select>`, `<textarea>` and `<dialog>`; those elements belong to the kit
alone, so focus rings, disabled states, ARIA wiring and design tokens live in one place. **Rule for
admin UI work: new admin UI uses `components/ui`; a missing variant is added to the kit.**

The `kestrel/ui-kit-first` block in `playground/eslint.config.mjs` enforces the rule with lint over
`layers/admin/app/**/*.vue` — components, layouts, pages and anything added next to them — ignoring
`components/ui/**`, the kit itself. Inline ESLint suppressions (a template `<!-- eslint-disable … -->` or
a script `/* eslint-disable … */`) do not work there; a suppression that is genuinely needed goes into a
`.ts` file or into the kit. `layers/public` has no kit and is out of scope; its markup is the consumer's
site, not the admin UI.

Kit inventory:
- `ActionMenu.vue` — dropdown menu behind a caller-styled trigger button.
- `Alert.vue` — inline message box; `role="alert"` for warning/error, `role="status"` otherwise.
- `Brand.vue` — the decorative product mark.
- `Button.vue` — every button and button-shaped link (`to` renders a `NuxtLink`).
- `ButtonGroup.vue` — segmented single- or multi-select toggle group.
- `Checkbox.vue` / `CheckboxGroup.vue` — native checkbox with indeterminate support; a group bound to `string[]`.
- `Combobox.vue` — searchable single/multi select with reorderable selection.
- `DatePicker.vue` / `DateRangePicker.vue` / `TimeInput.vue` — ISO date, date-range and time entry.
- `Dialog.vue` — modal with title, optional description, footer slot and `md|lg|xl|screen` sizes.
- `EmptyState.vue` — empty-list placeholder with an optional action slot.
- `Field.vue` / `Fieldset.vue` — label, hint and error wrappers that hand `id` and `aria-*` to the control slot.
- `FileInput.vue` — hidden file picker; `open()` opens it, `select` emits the chosen `File[]`.
- `Icon.vue` — sanitized inline SVG icon, `aria-hidden` unless it carries a name.
- `Menu.vue` — right-click context menu.
- `NumberInput.vue` — numeric input with min/max/step and an optional suffix.
- `Popover.vue` — anchored popover with a trigger slot.
- `Richtext.vue` / `RichtextToolbar.vue` — the TipTap editor and its toolbar.
- `Select.vue` — native select styled like the other controls.
- `TabList.vue` — the horizontal tab strip the system and insights screens sit in.
- `Table.vue` / `TableSort.vue` — the table shell (`head`/`body` slots, sticky header, `plain` for a table
  inlined in a card: no frame, no header fill, no row hover) and its sortable column header.
- `Textarea.vue` — multi-line text input.
- `TextInput.vue` — single-line input with optional leading icon and password reveal.
- `Toasts.vue` — the toast host with its polite/assertive live regions.
- `Tooltip.vue` — hover and focus tooltip.

Adding a variant: extend the kit component rather than dropping back to a raw element. A button variant is
a new member of `Button.vue`'s `variant` union plus its SCSS block. `primary`, `secondary`, `ghost`,
`danger` and `danger-ghost` are fully styled and carry the `.ui-button` base class and a size class.
`icon` (square, ghost, icon-only — the caller supplies `aria-label`; text content is not supported) and
`bare` (native button semantics, no styling — a clickable card, tile or tree row) carry only their own
modifier class, render the default slot unwrapped, and declare their rules inside `:where(…)`: call-site
classes win, and properties a call site does not set take the variant's defaults, on the `to` branch as
well (see **Admin CSS isolation** below). `icon` honours `size`
only where the call site sets one (`sm` 1.5rem, `md` 2rem, `lg` 2.5rem square); left out, the box stays at
1.5rem, so migrating a control to the kit does not resize it. The focus ring of both variants is declared
outside `:where(…)`, so a call-site `outline: none` on the modifier class cannot remove it. `Button.vue`
exposes `focus()` for components that move focus after a list edit; it focuses the `to` branch's link as
well as the button.

### Admin CSS isolation
The admin styles share a document with the consumer's own global CSS: Nuxt merges every layer's and the
app's `css: []` into one stylesheet for all routes, and a consumer's `body { font-family; color }` or
element selectors reach `/admin` like any other page. Cascade layers cannot hold that off — an unlayered
declaration beats every layered one whatever its specificity — so the admin styles carry no `@layer` at
all and win on specificity instead. `assets/scss/_scope.scss` holds the two root selectors and the two
mixins every rule in `assets/scss/` goes through:

- `$root` is `:is(.admin, .admin-portal)`, specificity (0,1,0) — one class-level selector, enough to
  outrank a plain element selector like `body`. `.admin` is the layout root
  (`layouts/admin.vue`), `.admin-portal` an admin root rendered outside it — the portal host below, the
  `Toasts.vue` region and `BootFailure.vue`, which renders instead of the layout. `.admin-portal` is
  `display: contents`, so it carries the inherited base (font, colour, line height) and the design tokens
  without adding a box.
- `_tokens.scss` also declares the admin's density tokens (`--text-base`, the tightened `--space-2…5`,
  `--control-height`, `--control-icon-size`) on `$root`, not on `.admin`, so a teleported overlay is sized
  like the rest of the admin.
- `_tokens.scss` declares the tokens on `$root`, not on `:root`: a consumer that defines `--color-text` or
  `--color-border` on `:root` no longer reaches the admin (the admin's own declaration on `.admin` shadows
  it by inheritance, not by the cascade), and the admin no longer redefines the consumer's tokens on the
  public site. Only `color-scheme` stays on `:root[data-theme=…]`, because the UA reads it from the
  document root; the attribute is set by the admin layout, so it exists only on admin routes.
- `_base.scss` binds the inherited base — `font-family`, `font-size` (`--text-root`), `line-height`,
  `color`, `-webkit-font-smoothing` — to `$root` (0,1,0), so it outranks the consumer's `body` (0,0,1) and
  ends inheritance from it.
- `_base.scss` also owns the layout utilities that more than one view uses: `.u-stack`, `.u-measure` and
  `.u-scroll` (`flex: 1 1 auto; min-height: 0; overflow: auto`, the scroll container inside the
  full-height panes). A class used by more than one component belongs here, never in a single
  component's `<style>`, so it stays available wherever it's used. `scope.test.ts` fails on a `u-*`
  class a template uses that the compiled `main.scss` does not declare, and on a `u-*` rule declared
  inside a `.vue` file.
- `element-defaults($selectors)` emits element defaults so they beat a consumer's element selector but
  never an admin class, which makes bundler order irrelevant. `font-family: inherit` is the one exception,
  applying blanket to all admin elements, because no admin class sets a font family except the three that
  say so explicitly (`Richtext.vue`'s `code`, `SystemEvents.vue`'s mono cell, `Textarea.vue`).
- The kit's `:where(…)` variant rules (`Button.vue`'s `icon` and `bare`, `FileInput.vue`) are prefixed
  with `$root`, which lifts them from specificity 0 to (0,1,0): a consumer's `a { color }` or
  `button { border }` no longer reaches an icon button, while a call-site class still wins — it is
  declared in the component that uses the kit, and a component's styles are emitted after the styles of
  the component it imports.

- `_base.scss` pins the whole inherited set on `$root`, not just font and colour: weight, style, variant,
  letter and word spacing, text align/indent/transform/shadow, white space, word break, hyphens, tab size,
  list style, cursor, caret colour, accent colour and visibility. Inheritance from the consumer's `body`
  ends at the admin root for all of them, and `_reset.scss` re-inherits the same set for unclassed
  elements so the chain continues inside the admin.
- `_reset.scss` also carries three blanket rules at (0,1,0) — `letter-spacing: inherit` (excluding the six
  kit classes that set tracking on purpose) and `caret-color`/`word-spacing`/`text-indent`/`text-shadow`/
  `hyphens`/`font-variant`/`visibility: inherit` — which beat a consumer's element selectors on *classed*
  admin elements too. They are safe only while no kit class declares those properties; `scope.test.ts`
  scans every component for exactly that and fails when one does.
- The admin owns its `::selection`, `::placeholder` and `::marker`, resets `outline-offset` and
  `text-decoration-thickness`, and resets `content` on `::before`/`::after` for unclassed elements.
- `:root[data-theme=light|dark]` carries `scroll-behavior: auto` next to `color-scheme`; the attribute is
  set by the admin layout, so the rule exists only on admin routes. The `rem` basis is neutralised by the
  layout's inline `style: 'font-size: initial'` on `htmlAttrs`, which outranks a consumer's
  `html { font-size }`. The theme is set on the `.admin` element as well as on `:root`, and the token
  blocks match both, so a consumer's `useHead` cannot strip the palette by clobbering the root attribute.
- `layers/admin/nuxt.config.ts` registers the kit with `priority: 10`. Without it an app component named
  `KestrelUiButton.vue` replaces the kit's button everywhere — the login form loses its submit control.

#### The portal host
reka-ui teleports every overlay — `DialogPortal`, `DropdownMenuPortal`, `ContextMenuPortal`,
`PopoverPortal`, `TooltipPortal`, `ComboboxPortal` and the portal inside `DatePickerContent` /
`DateRangePickerContent` — and its default target is `document.body`, which is outside `.admin`. Scoping
the stylesheet to the admin roots therefore left every overlay unstyled in a consumer app. The layout
renders `KestrelUiPortalHost` (`components/ui/PortalHost.vue`) before anything else: one
`<div id="kestrel-admin-portal" class="admin-portal" :data-theme>` teleported to the body, registered in
`composables/useAdminPortal.ts` while it is mounted. Every portal in the kit takes its target from
`useAdminPortal()` — `:to="portalTarget"` on a `*Portal`, `:portal="{ to: portalTarget }"` on the two
pickers that portal internally, and `Toasts.vue` teleports into the same host. The target falls back to
`'body'` while no host is mounted, which is what a standalone component test sees.

`components/portal-target.test.ts` reads every admin `.vue` file and fails when a
reka `*Portal` has no `:to="portalTarget"`, when `DatePickerContent`/`DateRangePickerContent` has no
`:portal="{ to: portalTarget }"`, or when anything but `PortalHost.vue` teleports straight to the body.
`components/ui/PortalHost.dom.test.ts` mounts the host and asserts that a dialog's overlay and content,
an open dropdown menu and the toast region all sit inside it.

What stays outside this: a consumer's element selector can still win over an *inherited* value on an
admin element that does carry a class and whose class does not declare that property — `color` is the
main one, and the properties derived from it (`outline-color`, `text-decoration-color`, `caret-color`,
`-webkit-text-fill-color`, the marker and placeholder colours) follow it. `!important` on a bare element
selector, and `content` on a global `*::before`/`*::after` rule that also matches classed admin elements,
cannot be beaten at all without an `!important` war or a specificity tie that would depend on stylesheet
order. A consumer can shut all of it off by putting its own reset in a named `@layer`; that is documented
as a consumer rule in `docs/consuming-kestrel-web.md`, not something the admin can enforce.

`layers/admin/app/assets/scss/scope.test.ts` compiles `main.scss` with Sass and fails if a rule is not
bound to `.admin`/`.admin-portal`, if a `@layer` comes back, if the document root carries anything but
`color-scheme` and `scroll-behavior`, if one of the inherited properties is no longer pinned on the admin
root, if `::selection`/`::placeholder`/`::marker` lose their admin scoping, or if a kit component starts
declaring one of the blanket-inherit properties. That is also what keeps the admin reset off the public
site: it does not depend on where the stylesheet is imported, the rules simply do not match outside the
admin. The one rule the test allows outside `.admin`/`.admin-portal` is `body.admin-body { margin: 0 }`,
which zeroes the browser's default body margin under `/admin`; `layouts/admin.vue` sets the `admin-body`
class through `useHead`'s `bodyAttrs` only while it is mounted, so the rule cannot match a public route.
In dev `installAdminClient()` additionally disables every stylesheet under `/admin` that
`isProtectedStyle()` (`utils/admin-style-guard.ts`) does *not* recognise as the layer's own — a path
matching `kestrel/layers/` or a `kestrel-*` segment, a `?scoped` query, or a `data-kestrel` attribute stays
live, everything else is switched off. Production carries no such guard, so the isolation has to hold on
its own there. A consequence: a consumer checkout whose directory name contains `kestrel-` keeps its own
stylesheets live under `/admin` in dev, which is what lets `scripts/isolation-diff.mjs` (below) run against
dev servers without a production build.

`scripts/isolation-diff.mjs` is the end-to-end proof. Run the playground and a consumer app that extends
the packed layer on two ports, then diff every admin view in both themes:

```bash
PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs \
  node scripts/isolation-diff.mjs http://localhost:3011 http://localhost:3012
```

It reports per computed property and separates geometry (`width`/`height`/`margin`), which is expected to
differ since the two apps have different content, row counts and scrollbars, from style leaks. Anything
but geometry is a real leak.

### Design tokens and contrast
`assets/scss/_tokens.scss` is the only place in `layers/admin` that names a colour. Every other rule
reads a token, so both themes can be checked by measuring the tokens alone. The contract: **the admin
meets WCAG 2.2 AA in the light and the dark theme** — 4.5:1 for text against the surface it sits on,
3:1 for the borders and graphics that identify a control and for the focus ring. The tokens split by
that role:

- Text: `--color-text`, `--color-text-muted`, `--color-primary-text` (accent text and links, separate
  from the accent *fill* `--color-primary`), `--color-link` (the SERP preview only), `--color-danger`,
  `--color-success`, `--color-warning-text` (`--color-warning` is a fill and border colour, never text),
  `--color-on-primary`, `--color-on-danger`, `--color-on-highlight`, `--color-on-overlay`,
  `--color-on-canvas`, `--color-primary-on-fill`.
- Controls and graphics (3:1): `--color-control-border` / `--color-border-strong` (input, select and
  secondary-button outlines), `--color-primary` (selection and chip borders), `--color-text-subtle`
  (icons, the status dot), `--color-focus` and `--color-focus-on-fill` — the ring on a filled primary
  or danger button, where `--color-focus` would sit on its own colour because the ring is drawn inside
  the button.
- Decorative: `--color-border` (table rules, card outlines, separators). 1.4.11 does not apply to it;
  it is reported by the script without a threshold. The dark value (`#5e5e6a`, 3.09:1 against the page)
  is high enough to stay visible; the light value stays low on purpose — a 3:1 hairline would turn every
  card into a box.
- Surfaces: `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-rail-bg`, `--color-active`,
  `--color-hover`, `--color-primary-soft`, `--color-highlight`, `--color-scrim`, `--color-overlay`
  (+ `--color-overlay-edge`, the hairline around an overlay button) and `--color-canvas`, the block
  preview's page surface. The preview simulates the public site, so `--color-canvas` is white in both
  themes by design, with `--color-on-canvas` as its text colour.

The pairs below are measured in both themes by `scripts/token-contrast.ts`
(`node --experimental-strip-types scripts/token-contrast.ts` prints the table) and again by
`scripts/token-contrast.test.ts` in `pnpm test`, so a new or retuned token cannot drop below its
threshold.

| Pair | Foreground | Background | Required | Light | Dark |
|---|---|---|---|---|---|
| body text on page | `--color-text` | `--color-bg` | 4.5:1 | #18181b on #f5f5fa — 16.30:1 | #fafafa on #09090b — 19.06:1 |
| body text on surface | `--color-text` | `--color-surface` | 4.5:1 | #18181b on #ffffff — 17.72:1 | #fafafa on #18181b — 16.97:1 |
| body text on raised surface | `--color-text` | `--color-surface-2` | 4.5:1 | #18181b on #f4f4f5 — 16.12:1 | #fafafa on #27272a — 14.27:1 |
| body text on rail | `--color-text` | `--color-rail-bg` | 4.5:1 | #18181b on #ffffff — 17.72:1 | #fafafa on #111113 — 18.07:1 |
| muted text on page | `--color-text-muted` | `--color-bg` | 4.5:1 | #6b6b73 on #f5f5fa — 4.86:1 | #a1a1aa on #09090b — 7.76:1 |
| muted text on surface | `--color-text-muted` | `--color-surface` | 4.5:1 | #6b6b73 on #ffffff — 5.28:1 | #a1a1aa on #18181b — 6.91:1 |
| muted text on raised surface | `--color-text-muted` | `--color-surface-2` | 4.5:1 | #6b6b73 on #f4f4f5 — 4.81:1 | #a1a1aa on #27272a — 5.81:1 |
| muted text on rail | `--color-text-muted` | `--color-rail-bg` | 4.5:1 | #6b6b73 on #ffffff — 5.28:1 | #a1a1aa on #111113 — 7.36:1 |
| link/accent text on page | `--color-primary-text` | `--color-bg` | 4.5:1 | #4f46e5 on #f5f5fa — 5.79:1 | #a5b4fc on #09090b — 9.98:1 |
| link/accent text on surface | `--color-primary-text` | `--color-surface` | 4.5:1 | #4f46e5 on #ffffff — 6.29:1 | #a5b4fc on #18181b — 8.89:1 |
| SERP preview link on surface | `--color-link` | `--color-surface` | 4.5:1 | #1a0dab on #ffffff — 12.43:1 | #8ab4f8 on #18181b — 8.41:1 |
| danger text on page | `--color-danger` | `--color-bg` | 4.5:1 | #d41d1d on #f5f5fa — 4.84:1 | #f87171 on #09090b — 7.19:1 |
| danger text on surface | `--color-danger` | `--color-surface` | 4.5:1 | #d41d1d on #ffffff — 5.26:1 | #f87171 on #18181b — 6.40:1 |
| warning text on page | `--color-warning-text` | `--color-bg` | 4.5:1 | #b45309 on #f5f5fa — 4.62:1 | #fbbf24 on #09090b — 11.92:1 |
| warning text on surface | `--color-warning-text` | `--color-surface` | 4.5:1 | #b45309 on #ffffff — 5.02:1 | #fbbf24 on #18181b — 10.61:1 |
| success text on page | `--color-success` | `--color-bg` | 4.5:1 | #137a37 on #f5f5fa — 5.00:1 | #4ade80 on #09090b — 11.42:1 |
| success text on surface | `--color-success` | `--color-surface` | 4.5:1 | #137a37 on #ffffff — 5.43:1 | #4ade80 on #18181b — 10.17:1 |
| primary button label | `--color-on-primary` | `--color-primary` | 4.5:1 | #ffffff on #4f46e5 — 6.29:1 | #ffffff on #6062ef — 4.68:1 |
| solid primary label | `--color-on-primary` | `--color-primary-solid` | 4.5:1 | #ffffff on #4f46e5 — 6.29:1 | #ffffff on #4f46e5 — 6.29:1 |
| primary button label (hover) | `--color-on-primary` | `--color-primary-hover` | 4.5:1 | #ffffff on #4338ca — 7.90:1 | #ffffff on #5a5ceb — 5.04:1 |
| danger button label | `--color-on-danger` | `--color-danger-solid` | 4.5:1 | #ffffff on #d41d1d — 5.26:1 | #ffffff on #dc2626 — 4.83:1 |
| highlighted text | `--color-on-highlight` | `--color-highlight` | 4.5:1 | #18181b on #fde68a — 14.23:1 | #fef3c7 on #854d0e — 6.15:1 |
| selected tab label | `--color-primary-on-fill` | `--color-active` | 4.5:1 | #4f46e5 on #f1f1f4 — 5.58:1 | #818cf8 on #232327 — 5.25:1 |
| chip text on page | `--color-text` | `--color-primary-soft over --color-bg` | 4.5:1 | #18181b on rgba(79, 70, 229, 0.1) over #f5f5fa — 14.10:1 | #fafafa on rgba(99, 102, 241, 0.16) over #09090b — 16.64:1 |
| chip text on surface | `--color-text` | `--color-primary-soft over --color-surface` | 4.5:1 | #18181b on rgba(79, 70, 229, 0.1) over #ffffff — 15.25:1 | #fafafa on rgba(99, 102, 241, 0.16) over #18181b — 14.36:1 |
| badge text (warning) on surface | `--color-warning-text` | `--color-surface` | 4.5:1 | #b45309 on #ffffff — 5.02:1 | #fbbf24 on #18181b — 10.61:1 |
| overlay button label | `--color-on-overlay` | `--color-overlay over --color-bg` | 4.5:1 | #ffffff on rgba(9, 9, 11, 0.72) over #f5f5fa — 8.68:1 | #ffffff on rgba(9, 9, 11, 0.72) over #09090b — 19.90:1 |
| control border on page | `--color-control-border` | `--color-bg` | 3:1 | #87878f on #f5f5fa — 3.28:1 | #71717a on #09090b — 4.12:1 |
| control border on surface | `--color-control-border` | `--color-surface` | 3:1 | #87878f on #ffffff — 3.56:1 | #71717a on #18181b — 3.67:1 |
| strong border on page | `--color-border-strong` | `--color-bg` | 3:1 | #87878f on #f5f5fa — 3.28:1 | #71717a on #09090b — 4.12:1 |
| strong border on surface | `--color-border-strong` | `--color-surface` | 3:1 | #87878f on #ffffff — 3.56:1 | #71717a on #18181b — 3.67:1 |
| chip/selection border on page | `--color-primary` | `--color-bg` | 3:1 | #4f46e5 on #f5f5fa — 5.79:1 | #6062ef on #09090b — 4.25:1 |
| chip/selection border on surface | `--color-primary` | `--color-surface` | 3:1 | #4f46e5 on #ffffff — 6.29:1 | #6062ef on #18181b — 3.79:1 |
| focus ring on page | `--color-focus` | `--color-bg` | 3:1 | #4f46e5 on #f5f5fa — 5.79:1 | #818cf8 on #09090b — 6.67:1 |
| focus ring on surface | `--color-focus` | `--color-surface` | 3:1 | #4f46e5 on #ffffff — 6.29:1 | #818cf8 on #18181b — 5.94:1 |
| focus ring on raised surface | `--color-focus` | `--color-surface-2` | 3:1 | #4f46e5 on #f4f4f5 — 5.72:1 | #818cf8 on #27272a — 4.99:1 |
| focus ring on rail | `--color-focus` | `--color-rail-bg` | 3:1 | #4f46e5 on #ffffff — 6.29:1 | #818cf8 on #111113 — 6.32:1 |
| focus ring on primary fill | `--color-focus-on-fill` | `--color-primary` | 3:1 | #ffffff on #4f46e5 — 6.29:1 | #ffffff on #6062ef — 4.68:1 |
| focus ring on danger fill | `--color-focus-on-fill` | `--color-danger-solid` | 3:1 | #ffffff on #d41d1d — 5.26:1 | #ffffff on #dc2626 — 4.83:1 |
| icon/status graphic on page | `--color-text-subtle` | `--color-bg` | 3:1 | #87878f on #f5f5fa — 3.28:1 | #71717a on #09090b — 4.12:1 |
| icon/status graphic on surface | `--color-text-subtle` | `--color-surface` | 3:1 | #87878f on #ffffff — 3.56:1 | #71717a on #18181b — 3.67:1 |
| status dot (danger) on surface | `--color-danger` | `--color-surface` | 3:1 | #d41d1d on #ffffff — 5.26:1 | #f87171 on #18181b — 6.40:1 |
| separator border on page | `--color-border` | `--color-bg` | decorative | #c4c4cc on #f5f5fa — 1.60:1 | #5e5e6a on #09090b — 3.11:1 |
| separator border on surface | `--color-border` | `--color-surface` | decorative | #c4c4cc on #ffffff — 1.73:1 | #5e5e6a on #18181b — 2.77:1 |

## UI actions
Every user-triggered write in `layers/admin` — save, publish, delete, discard, bulk status, media
folder and upload work, the system-screen operations — is a declared step sequence run by the small
runner in `layers/core/app/utils/actions.ts`, mirroring the backend's `definePipeline({ name, steps })`.
Components own UI state (dialog flags, selections, busy refs, queues) and call `runAction`; the action
owns the order of guard, validation, request, rebaseline, toast and navigation.

### Actions vs loads
An **action** is a user action: something a person triggers that writes, navigates, guards against
unsaved changes, confirms through a dialog, or reports through a toast or an inline error. Those go
through `runAction` and named steps. A **load** is data a screen fetches to render itself — on mount,
on opening a viewer, on switching a tab. Loads stay in the component or composable that owns the data
and call the api client directly; `useEditForm.loadDelivery` and `SystemReferences.vue`'s two
broken-list fetches are the reference examples. The reason: a load has no guard, no dialog, no toast,
no error mapping and no navigation — the runner's whole surface would be ceremony around a single
`await`, and its failures are handled by the screen that renders the data, typically by showing an
empty or error state.

`SystemImages.vue` follows the same split: registering, syncing, pruning image sizes and retrying the
variants that gave up are actions (`imagesRegisterAndSync`, `previewPrune`, `prune`,
`imagesRetryFailed`); polling `GET /admin/images/status` for job progress
is a load, and stays a plain `setInterval`/`clearInterval` in the component rather than a repeated
`runAction` call — the runner (`layers/core/app/utils/actions.ts`) has no cancellation, it only ever
runs a step sequence to completion, so a poll loop that needs to stop when the tab unmounts has to live
outside it.

### The runner
`layers/core/app/utils/actions.ts` exports four things, auto-imported app-wide:

| export | what it does |
|---|---|
| `defineStep(name, run)` | One named step. `run` receives the context and may be async. |
| `defineAction({ name, steps, always? })` | Validates the definition (non-empty name, at least one step, every step named) and returns it. |
| `runAction(action, input, options?)` | Runs it, returning `{ ok: true, result? }` or `{ ok: false, error, meta? }`. `options.rethrow` (default `import.meta.dev`) picks dev or production behaviour for an unexpected throw — see below. |
| `setActionDebug(enabled)` | Turns per-step logging on. |

The context a step sees is `{ input, result?, fail(message, meta?), done(result?) }`; calling either ends
the step, and the runner turns the outcome into an `ActionResult`. `ctx.result` starts `undefined`; the
first step of an action that carries a result seeds it, and later steps read and extend it. A step that
throws anything else is a bug, not a designed failure, so the runner never disguises it as one: it is
always logged with `console.error`, and then, in dev (`import.meta.dev`, overridable through `runAction`'s
third argument so tests don't have to stub a global), rethrown — the exception surfaces as an unhandled
rejection instead of a toast, the same as any other uncaught bug. In production it becomes
`{ ok: false, error, meta: { action, step, unexpected: true } }` instead.

`always` steps run after the main loop in **every** outcome — a clean pass, `ctx.done`, `ctx.fail` and
an unexpected throw — and cannot change the action's result. They are how a `try/finally` is expressed:
the flags a run switched on (`form.saving`, `ops.busy`) and the refreshes that must happen even after a
failed write go there. The same dev/production split applies to an `always` step's own unexpected throw,
except every remaining `always` step still runs first — cleanup is never skipped.

`runtimeConfig.public.kestrelDebugActions` (set it from a consumer's `nuxt.config.ts` or
`NUXT_PUBLIC_KESTREL_DEBUG_ACTIONS`) makes `plugins/actions-debug.client.ts` call `setActionDebug(true)`,
which logs one `console.debug` line per step with the action name, the step name, the outcome and the
duration in milliseconds.

### Dependency injection
A step never reaches for a composable. Every collaborator arrives as a field of `ctx.input`, typed in
`layers/admin/app/actions/types.ts`:

| port | stands for |
|---|---|
| `ActionDeps` (`api`, `t`, `toast`, `capabilities`) | `useAdminApi()`, `useT().t`, `useToast()`, `useCapabilities()`, built together by `useActionDeps()`. `api` takes an `ApiRoute` (`{ method, path }`) from `capabilities.route(pipeline, params?)`/`.verbRoute(collection, verb, params?)`, never a path literal. Actions that talk to the backend take `WithDeps`. |
| `EditFormPort` | The editor form's whole state surface — field keys, dirty keys, request body, block tree, errors, saving flag, `validateAll` / `validateBlocks`, `applySaved`, `setDelivery`, `revealError`. Built by `useEditForm`. |
| `BusyPort` (`setBusy`, `busy`, `setError?`) | A screen's busy flag, with a reader so `ops.busy:off` only clears what its own run turned on, plus an optional inline error line. |
| `NavigatePort` | `navigateTo(path)` or `router.replace({ query })`, chosen by the `Destination` union the step hands it. |
| `ConfirmPort` | `confirmDiscard` from `useUnsavedGuard`. |
| `RefreshPort` | Whatever the screen does to refetch (`list.refresh` / `data.reload`). |

A step takes its collaborators as input, never a composable, so it is testable without Nuxt. Inside
`layers/admin/app/actions/**`, imports from `#kestrel/*` must be `import type` only, and runtime imports
use `#kestrel-core/...` instead — a relative path that walks into another layer is a lint error
(`kestrel/layer-boundaries`).

One relative import does pull a `#kestrel-admin/*` module at runtime (`../../utils/edit-form` imports
`#kestrel-admin/utils/field-empty`), so only the `admin` project (`layers/admin/**/*.test.ts`) carries the
`#kestrel-admin/` → `layers/admin/app/` alias; both projects resolve `#kestrel-core/` and `#kestrel/cast`.

A third project, `components`, covers what `admin` and `rest` cannot: `.vue` files, and browser-only
code such as DOMPurify. It runs `environment: "nuxt"` (`@nuxt/test-utils/config`'s `defineVitestProject`,
`environmentOptions.nuxt.rootDir` pointing at `playground`), which boots the real playground Nuxt app
once per run and mounts components with `mountSuspended` (`@nuxt/test-utils/runtime`) under jsdom
(`environmentOptions.nuxt.domEnvironment`) — layer aliases and Nuxt auto-imports resolve exactly as they
do in the app, so a component test needs no hand-rolled stubs beyond `registerEndpoint` for `/api/*` calls
and `vi.mock` for an explicit module import. Its `include` is `layers/**/*.dom.test.ts`; `admin` and
`rest` exclude that pattern, so a component is never picked up twice. Write a `*.dom.test.ts` next to a
component when its behavior needs rendering, DOM interaction (click, keyboard, form submit) or a browser
API (DOMPurify's `window`, focus) that a plain-node `*.test.ts` cannot exercise; keep composables and
utilities that take their dependencies as plain arguments in the fast node-environment `admin`/`rest`
projects.

### Step names
Steps live in `layers/admin/app/actions/steps/`. Each is either a plain step or a factory that takes
declarative configuration — plain strings and pure functions of `ctx` — and returns one. A factory never
receives a component, a composable, a ref or a reactive object.

Every step in `actions/**` is declared with `defineUiStep(name, run)` (`layers/admin/app/actions/define.ts`),
a thin wrapper over the core `defineStep`. Step names are a checked union (`UiStepName`, from
`layers/admin/app/actions/step-names.ts`'s `uiStepNames`), so a misspelling is a `tsc` error, not a
runtime surprise; `actions/step-names.test.ts` fails if a registered name is missing from that union or a
listed name is never registered.

| step | file | what it does |
|---|---|---|
| `guard.unsaved` | `steps/guard.ts` | Asks `confirm(t(messageKey))` and fails when the user declines. |
| `guard.bypass` | `steps/guard.ts` | Calls `bypassGuard()`, the page's own skip flag for the router guard. |
| `guard.selection` | `steps/guard.ts` | Fails on an empty selection. |
| `guard.tab` | `steps/guard.ts` | Fails on an unknown tab id or the already-active tab. |
| `guard.status` | `steps/guard.ts` | Fails while a save runs, without a status field, or when the record already has that status. |
| `dialog.confirm` | `steps/guard.ts` | Fails when the dialog's already-collected answer is false. It does not open anything. |
| `guard.anySucceeded` | `steps/guard.ts` | Fails a per-item batch only when *nothing* in it succeeded, using the batch's last error message; shared by `deleteRecord` and `bulkDelete`. |
| `api.write` | `steps/api.ts` | The one document write of the editor. Collects an `ApiError` into `ctx.result.failure` instead of throwing. |
| `api.request` | `steps/api.ts` | One arbitrary request, with `onSuccess` and an optional `onError`; without `onError` the `ApiError` propagates. |
| `api.each` | `steps/api.ts` | One request per id, sequentially, with policy `'continue'` or `'stop'`, a per-item error hook and one report at the end. |
| `media.each:files` / `media.each:folders` | `actions/media.ts` | The `api.each` factory under batch-specific names, so `deleteItems`'s file batch and its later folder batch log as distinct steps. |
| `references.precheck` | `steps/api.ts` | One `GET /admin/references/to/{target}/{id}` per id, to warn before a delete. |
| `form.reset` | `steps/form.ts` | Seeds `ctx.result` and clears form, field and row errors. |
| `form.validate` | `steps/form.ts` | Runs client field validation and, only if that passes, client block validation. |
| `form.setStatus` | `steps/form.ts` | Writes the requested status into the form before the save. |
| `form.saving` | `steps/form.ts` | `form.saving:on` / `form.saving:off` around the request. |
| `form.rebaseline` | `steps/form.ts` | Hands the saved document to `applySaved`. |
| `form.mapErrors` | `steps/form.ts` | Turns the collected failure into a block, row, field or form error. |
| `form.revealError` | `steps/form.ts` | Scrolls the first flagged block into view. |
| `form.outcome` | `steps/form.ts` | Converts a collected failure into `ctx.fail`. |
| `toast.success` | `steps/notify.ts` | One success toast, skipped when the picker returns `null`. |
| `toast.error` | `steps/notify.ts` | One error toast, from a raw message or a translation key (`message || t(key)`). |
| `toast.summary` | `steps/notify.ts` | One success toast for a per-item loop, only when nothing failed. |
| `ops.busy` | `steps/notify.ts` | `ops.busy:on` / `ops.busy:off`; the `:on` variant also clears the inline error, `:off` only fires while `busy()` is still true. |
| `ops.error` | `steps/notify.ts` | Writes the inline error line. |
| `route.navigate` | `steps/route.ts` | Awaits the `NavigatePort` with a path or a query destination. |
| `list.refresh` | `steps/route.ts` | Awaits the `RefreshPort`. |
| `data.reload` | `steps/route.ts` | The same factory under the name the media and system screens use. |
| `data.reload:files` / `data.reload:folders` | `actions/media.ts` | A reload that only fires when its batch actually had items; `deleteItems` runs one for files, one for folders. |
| `guard.filesDeleted` / `guard.foldersDeleted` | `actions/media.ts` | Fails `deleteItems`'s main sequence when the file batch, respectively the folder batch, reported any failure. |
| `media.applyTargets` | `actions/media.ts` | Does the one write `renameOrMove` needs: a file rename, a folder rename, or a multi-target move. |
| `upload.begin` / `upload.request` / `upload.settle` | `actions/media.ts` | Marks the queued item `'uploading'` (`progress` 0); sends the multipart POST through the injected `useUploadTransport` transport, updating `progress` from its callback and switching to `'processing'` at 100% until the response arrives; then seeds `ctx.result` with the item. |
| `user.validate` | `actions/system.ts` | Field validation before the request; declared separately, under the same name, in `userCreate` (username + password) and `userUpdate` (username, plus the password only when one was typed). |
| `user.patch` / `user.active` / `user.password` | `actions/system.ts` | The three halves of `userUpdate`: `PATCH /users/{id}` with only the changed fields, `POST /users/{id}/deactivate` or `/activate`, `PUT /users/{id}/password`. Each is a no-op when its part did not change, and each maps the failure through `utils/user-errors.ts` into the inline error. |
| `user.delete` | `actions/system.ts` | `DELETE /users/{id}`, with the same error mapping. |
| `delivery.refresh` | `steps/delivery.ts` | When the caller has the collection's `publishStatus` capability, reloads `GET /admin/publish-status/{collection}/{id}` after a successful save, so the live lamp reflects the authoritative per-locale state in both delivery modes. |
| `delivery.toast` | `steps/delivery.ts` | For a collection the schema reports as `published` (independent of the caller's own access), toasts when the write response's `_events.status` is `"error"` or `"pending"`, naming the retry route for the active delivery mode. |
| `delivery.deleteToast` | `actions/editor.ts` | For a collection the schema reports as `published`, toasts that the record was deleted but is still online when `_events.status` of the delete response is `"error"`. |
| `api.request:register` | `actions/system.ts` | Inline step (not the `api.request` factory): a no-op when the declared size list is empty, otherwise `PUT /admin/images/sizes`; a 409 (name collision with a `source: "config"` size) returns silently, the same as the empty-list case — nothing is written to `ctx.result` either way. Used by `imagesRegisterAndSync`. |
| `api.request:sync` | `actions/system.ts` | The `api.request` factory under this name — the sync half of `imagesRegisterAndSync`, run after `api.request:register`. Named separately so the two requests of one action log as distinct steps, the same convention as `media.each:files`/`media.each:folders`. |

`api.write` picks its request from the form's mode and id: `PUT /{collection}` in single mode,
`POST /{collection}` for a new record, `PATCH /{collection}/{id}` for an existing one. Only the `PATCH`
sends a partial body — the dirty keys; the other two send every field key. The response **is** the saved
document; `api.write` reads its `_events` member (added by `events.relay`, absent for a pipeline with no
subscriber) into the outcome's `events` field and leaves everything else of the response on `record`
untouched — a document with extra sibling members (`_locales`, `_translations`, or `PUT /redirects`'s
`redirects` field) passes through exactly as before.

### Actions
| action | file | steps | called from |
|---|---|---|---|
| `saveRecord` | `actions/editor.ts` | `form.reset`, `form.validate`, `form.saving:on`, `api.write`, `delivery.refresh`, `delivery.toast`, `form.rebaseline`, `form.mapErrors`, `form.outcome`, `toast.success`; always `form.saving:off`, `form.revealError`, `toast.error` | `useEditForm.submit` |
| `setStatus` | `actions/editor.ts` | `guard.status`, `form.setStatus`, then `saveRecord`'s steps | `useEditForm.setStatus`, reached from `CollectionEditor.vue` |
| `discardRecord` | `actions/editor.ts` | `guard.unsaved`, `route.navigate` | `pages/admin/[collection]/[id].vue` cancel |
| `leaveEditor` | `actions/editor.ts` | `guard.bypass`, `route.navigate` | the post-create redirect in `pages/admin/[collection]/[id].vue` |
| `previewDeleteRecord` | `actions/editor.ts` | `guard.selection`, `references.precheck` | the delete dialog of `pages/admin/[collection]/[id].vue` |
| `deleteRecord` | `actions/editor.ts` | `dialog.confirm`, `ops.busy:on`, `api.each`, `delivery.deleteToast`, `guard.anySucceeded`, `guard.bypass`, `route.navigate`, `toast.success`; always `ops.busy:off` | the delete dialog's confirm |
| `deleteTranslation` | `actions/editor.ts` | `dialog.confirm`, `ops.busy:on`, `api.request` (`DELETE /{collection}/{id}/translations/{locale}`; a 409 — last remaining translation — toasts the backend message and fails), `guard.bypass`, `route.navigate`, `toast.success`; always `ops.busy:off` | the delete dialog's "delete only this translation" confirm |
| `copyTranslation` | `actions/editor.ts` | `dialog.confirm` (only required when the form is dirty — the caller passes `confirmed`), `api.request` (`GET /admin/{collection}/{id}?locale={source}`; on success runs `translationSourceValues` and writes each entry through `form.setField`; toasts and fails on error), `toast.success` | `useEditForm.copyTranslation`, from `TranslationCopyBanner.vue`'s copy button |
| `switchSystemTab` | `actions/editor.ts` | `guard.tab`, `guard.unsaved`, `route.navigate` | `pages/admin/system.vue::setTab` |
| `bulkSetStatus` | `actions/list.ts` | `guard.selection`, `ops.busy:on`, `api.each`, `ops.error`, `toast.summary`, `list.refresh`; always `ops.busy:off` | the list's bulk bar |
| `previewBulkDelete` | `actions/list.ts` | `guard.selection`, `references.precheck` | `useListBatchActions.askDelete` |
| `bulkDelete` | `actions/list.ts` | `dialog.confirm`, `ops.busy:on`, `api.each`, `guard.anySucceeded`, `list.refresh`, `toast.success`; always `ops.busy:off` | `useListBatchActions.confirmDelete` |
| `createFolder` | `actions/media.ts` | `ops.busy:on`, `api.request`, `data.reload`; always `ops.busy:off` | `MediaLibrary.vue`, new folder and drop |
| `renameOrMove` | `actions/media.ts` | `ops.busy:on`, `media.applyTargets`, `data.reload`; always `ops.busy:off`, `toast.error` | `MediaLibrary.vue`, rename dialog and drag-and-drop |
| `deleteItems` | `actions/media.ts` | `dialog.confirm`, `ops.busy:on`, `media.each:files`, `data.reload:files`, `guard.filesDeleted`, `media.each:folders`, `data.reload:folders`, `guard.foldersDeleted`, `toast.success`; always `ops.busy:off` | `MediaLibrary.vue`, delete dialog |
| `previewDeleteItems` | `actions/media.ts` | `references.precheck` | `MediaLibrary.vue`, delete dialog preview |
| `upload` | `actions/media.ts` | `upload.begin`, `api.request`, `upload.settle` | `useMediaUpload`, once per queued file |
| `setMediaMeta` | `actions/media.ts` | `ops.busy:on`, `api.request` (inline error only on failure, no toast either way), `data.reload`; always `ops.busy:off` | `MediaLibrary.vue`, media viewer save |
| `setMediaProvenance` | `actions/media.ts` | `ops.busy:on`, `api.request` (inline error only on failure, no toast either way), `data.reload`; always `ops.busy:off` | `MediaLibrary.vue`, media viewer save |
| `publishAll` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts how many pages it queued); always `ops.busy:off` | `SystemDeliveryStale.vue` |
| `retryStale` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts how many pages it queued again); always `ops.busy:off` | `SystemDeliveryStale.vue` |
| `exportMedia` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts on success); always `ops.busy:off` | `SystemDelivery.vue` |
| `replicationSnapshot` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts on success; on error toasts unless the status is 404 — then calls `onNotFound` instead — and always fails), `data.reload`; always `ops.busy:off` | `SystemReplication.vue` |
| `replicationRestore` | `actions/system.ts` | `dialog.confirm`, `ops.busy:on`, `api.request` (no success toast; toasts and fails on error), `data.reload`; always `ops.busy:off` | `SystemReplication.vue` |
| `migrationsDryRun` | `actions/system.ts` | `ops.busy:on`, `api.request` (`POST /admin/migrations/apply` with `{ dry: true }`; toasts and fails on error); always `ops.busy:off` | `SystemMigrations.vue`, "Dry run" button |
| `migrationsApply` | `actions/system.ts` | `dialog.confirm`, `ops.busy:on`, `api.request` (`POST /admin/migrations/apply` with `{ dry: false }`; toasts the applied count on success; toasts and fails on error), `data.reload`; always `ops.busy:off` | `SystemMigrations.vue`, "Apply" confirm |
| `userCreate` | `actions/system.ts` | `user.validate`, `ops.busy:on`, `api.request` (toasts on success; inline error only, no toast, on failure), `data.reload`; always `ops.busy:off` | `UserNewDialog.vue` |
| `userUpdate` | `actions/system.ts` | `user.validate`, `ops.busy:on`, `user.patch`, `user.active`, `user.password`, `toast.success`, `data.reload`; always `ops.busy:off` | `UserEditDialog.vue` |
| `userDelete` | `actions/system.ts` | `dialog.confirm`, `ops.busy:on`, `user.delete`, `toast.success`, `data.reload`; always `ops.busy:off` | `UserDeleteDialog.vue` |
| `userToggle` | `actions/system.ts` | `ops.busy:on`, `api.request` (`POST /users/{id}/deactivate` or `/activate`; no success toast; toasts the mapped message and fails on error), `data.reload`; always `ops.busy:off` | `SystemUsers.vue`, row menu |
| `eventsRetryAll` | `actions/system.ts` | `dialog.confirm` (only when there's at least one dead-letter event), `ops.busy:on`, `api.request` (toasts the retried count on success; toasts and fails on error), `data.reload`; always `ops.busy:off` | `SystemEvents.vue` |
| `eventsRetryOne` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts on success; on error toasts `events.retryNotFound` on 404, otherwise the raw message; always fails), `data.reload`; always `ops.busy:off` | `SystemEvents.vue` |
| `referencesRebuild` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts on success), `data.reload`; always `ops.busy:off` | `SystemReferences.vue` |
| `linksRebuild` | `actions/system.ts` | `ops.busy:on`, `api.request` (toasts and fails on error; toasts on success), `data.reload`; always `ops.busy:off` | `SystemReferences.vue` |
| `previewPrune` | `actions/system.ts` | `api.request` (`GET /admin/images/status`; on success sets the result to the orphaned sizes and variant count; toasts and fails on error), `guard.selection` (fails when nothing is orphaned) | `SystemImages.vue`, "Remove orphaned" button, to fill the confirm dialog |
| `prune` | `actions/system.ts` | `dialog.confirm` (requires `confirmed` and a non-empty size list), `ops.busy:on`, `api.request` (`POST /admin/images/prune`; toasts success; on error sets the inline dialog error, toasts and fails), `data.reload`; always `ops.busy:off` | `SystemImages.vue`, prune dialog confirm |
| `imagesRetryFailed` | `actions/system.ts` | `dialog.confirm` (requires `confirmed` and at least one failed variant), `ops.busy:on`, `api.request` (`POST /admin/images/retry-failed`; toasts the retried variant and media counts; on error sets the inline dialog error, toasts with the run id and fails), `data.reload`; always `ops.busy:off` | `SystemImages.vue`, "Retry failed variants" dialog confirm |
| `imagesRegisterAndSync` | `actions/system.ts` | `ops.busy:on`, `api.request:register` (`PUT /admin/images/sizes`; no-op on an empty size list; a 409 collision returns silently; any other error toasts and fails), `api.request:sync` (`POST /admin/images/sync`; toasts success; a 409 — a sync already running — returns silently, any other error toasts and fails), `data.reload`; always `ops.busy:off` | `SystemImages.vue`, "Synchronize" button |

The system actions above that toast from inside `api.request` (`publishAll` through
`imagesRegisterAndSync`) do so because their `onSuccess` / `onError` callbacks call `deps.toast.success`
/ `deps.toast.error` directly — there is no separate `toast.success` or `toast.error` step to name in
the sequence. `api.request:register` breaks the pattern: it stays silent on both a clean registration
and a 409 collision — nothing is written to `ctx.result` and no toast fires either way — and only toasts
when the request fails for another reason. A 409 collision still surfaces to the user, just not through
this step: `SystemImages.vue`'s own `conflictingSizes` comparison, computed after the action's
`data.reload`, is what turns it into an inline alert (see **Registration at boot, variants on a
button**).

### Adding an action
1. Declare the input interface next to the action, extending `WithDeps` when it talks to the backend and
   adding only the ports it needs.
2. Reuse a step from `actions/steps/`. Add a new shared step only when a second action would otherwise
   repeat the same logic; a one-off stays inline in the action file.
3. Put the action in the file that matches its screen (`editor.ts`, `list.ts`, `media.ts`, `system.ts`).
4. The component builds the input from its own auto-imported composables and reacts to `{ ok }` alone —
   closing a dialog, clearing a selection. It does not re-run any of the action's own work.
5. Add a unit test with a faked `api`; the tests run in plain node, so keep the step free of Nuxt.
6. List the action in the table above.

### Failure conventions
`ctx.fail` short-circuits the main loop, so anything that has to run in both outcomes goes into
`always`: the `saving` and `busy` flags, and the media refresh that fires even after a failed delete.
`form.saving:off` and `ops.busy:off` only undo what their own run switched on, so a guard that rejects
before the flag went up leaves a concurrent run alone. An `*.outcome` step is for the other case — a
failure that was deliberately collected in `ctx.result` (so that the mapping steps after it still run)
and has to become a visible failure at the end; `form.outcome` is the only one.

`meta.unexpected` (see **The runner**) is attached by `runAction` itself, after every step — main and
`always` — has already run, so no step can inspect it to decide whether to toast. `useEditForm`'s
`submit`/`setStatus`/`copyTranslation`, `useListBatchActions`'s `askDelete`/`confirmDelete`/`setStatus`,
`useMediaUpload`'s upload, and every other `runAction` call site under `layers/admin` — the system-screen
components, the record editor's save/delete/discard/leave flow, the user dialogs and the media library and
its viewer — call `toastUnexpected(deps, result)` (`layers/admin/app/actions/steps/notify.ts`) right after
`runAction` resolves, which shows `toast.unexpected` ("Unerwarteter Fehler, Details in der
Browser-Konsole" / "Unexpected error, details in the browser console") exactly when `meta.unexpected` is
`true`. The one exception is `pages/admin/system.vue`'s `switchSystemTab` call: it still surfaces an
unexpected failure only the way it always has, through whatever inline error or toast step the action
itself defines (often none, in production).

Per-item loops choose their policy explicitly: `'continue'` for bulk status and bulk delete, which
report every failure and act on the partial success, `'stop'` for media delete and multi-target move,
where a later item would compound the damage.

Where a message lands is part of the behaviour, not a detail:

- editor save and publish — the inline form error **and** an error toast **and** `revealError()`;
- editor and list delete — one toast per failed id, plus the inline dialog error only when *nothing*
  succeeded;
- bulk status — one toast per failed id, the inline error whenever anything failed, and a success toast
  only on a clean run;
- media folder create, rename and delete, media meta and provenance edits, and user create and
  set-password — the inline dialog error only, no toast; a success toast only on success;
- media drag-and-drop move, media upload (except a 401, which the reauth interceptor owns), user toggle,
  publish-all, retrying failed re-renders, media export, snapshot and restore, references rebuild and
  links rebuild — toast only;
- replication `notFound` — the inline alert, no toast;
- `imagesRegisterAndSync` — toast only on either half's failure; a 409 on either half (a name collision
  on register, or a sync already running) is not a failure at all — the step returns without a toast or
  an inline error and the action continues (a register 409 still lets the sync request run). The tab's
  own polling and its client-computed `missingSizes`/`conflictingSizes` alerts are the only feedback for
  that case;
- image prune — the inline dialog error **and** a toast on failure, a success toast only on a clean run;
  `previewPrune`, which only loads the orphan list to fill that dialog, toasts on failure and fails
  without opening it.

## Version history
`revisions@1` (`@michaelthielemann/kestrel-revisions-default`) records a full snapshot of the stored
fields on every save, per collection, document and locale. The `revisions` feature
(`layers/core/pipelines/features/revisions.ts`) wires it:

- `revisions.record:<c>` goes **directly after** `content.create:<c>` and `content.update:<c>` — an
  `at: "after"` patch, so it lands next to the content step whatever `references`, `links` or
  `delivery` insert further down. `revisions.remove:<c>` and `revisions.removeTranslation:<c>` follow
  the matching content step the same way, so a deleted document takes its history with it.
- Per `multi` collection it adds `<c>Revisions` (list), `<c>Revision` (read, with the snapshot),
  `label<C>Revision` and `restore<C>Revision`, routed under `/admin/<c>/:id/revisions…`. Reading needs
  `<c>.manage`, labelling and restoring `<c>.write`. `pages` keeps its historical singular names
  (`pageRevisions`, `restorePageRevision`), like every other pipeline of that collection.
- The restore pipeline is **derived**, not written out: `FeatureModule.derive` receives the pipelines
  as composed so far and builds `authn.requireUser, authz.require:<c>.write, revisions.restore:<c>` +
  the `update<C>` pipeline from its third step + `events.emit:<event>.restored`. That is why
  `revisions` is last in `featureOrder` — the tail it copies has to be complete. A restore is
  therefore exactly a save: it validates, sanitizes, checks references and records its own revision and
  indexes, and its `page.restored` emit triggers `publishPage` the same way `updatePage`'s does, so a
  restored published page goes live again and a restored draft does not. `revisions.reportRestore` sits
  between the tail and the event and puts what the restore had to
  leave out on the response as `restore: { revisionId, dropped, missing }` — `dropped` are the
  snapshot's fields the model no longer has (the restore leaves them out instead of failing),
  `missing` the fields added since, which keep their current value. `GET …/revisions/:revisionId`
  carries the same analysis next to the snapshot.
- `pruneRevisions` (`revisions.prune`, cron `15 3 * * *`) applies retention across the whole store.
- `presetModuleConfig` passes `keep`, `maxSnapshotBytes`, `pruneOnWrite` and `maxLimit` through from
  `options.revisions`, and derives `statusField`/`liveStatuses` from the collections' workflow
  (`resolveWorkflow`), so "never prune a state that was live" follows a custom workflow instead of the
  literal `status`/`published` default. Collections that disagree about their status field are a
  configuration error naming `overrides` as the way out.

### The history in the editor
The button sits left of Undo in `pages/admin/[collection]/[id].vue`, shown when the feature is on, the
record exists and the user has `<c>.manage`. It opens `PageHistory.vue` (a `size="screen"` kit dialog):
the tree on the left, the selected version on the right.

`utils/revision-lanes.ts` is the whole graph logic and has no Vue in it. `layoutRevisions(items, head)`
walks the page newest-first, assigns each row a lane, a branch number and a per-branch colour, and
reports `truncated` when a parent is off the loaded page.

`PageHistoryTree.vue` renders that as one small SVG per row plus text; it is a `listbox` of `option`s
with a roving tabindex, Arrow/Home/End/Enter, a visually hidden per-row sentence for screen readers, and
below 30rem the lanes collapse into indentation with a coloured left border. Colour is never the only
carrier: every row names its branch, its origin and its markers in words. No graph library is involved —
a git graph is a list with lanes and has to scroll, focus and read out like a list.

`utils/revision-restore.ts` turns the restore report and a validator's `details` into lines that name
a field by its label: the details pane shows the gap as a warning **before** the restore, the
confirmation repeats it, the success toast names what was left out, and a 400 on the restored body
lists the validator's own problems instead of a generic failure.

`utils/revision-diff.ts` compares the selected snapshot with the editor's current values: the changed
top-level fields (order-independent, treating `null`/`undefined`/`""`/`[]` as the same absence) and the
block count per type. `actions/revisions.ts` holds the four UI actions (`loadRevisions`,
`readRevision`, `restoreRevision`, `labelRevision`); `usePageHistory.ts` keeps the paging, the
selection and the detail fetch. After a restore the editor reloads through
`EditorExpose.reload()` (`useEditForm`'s `reload`, which re-fetches the row and re-baselines) and the
history reloads, so the head marker moves without a page reload.

## Page builder
`pages.body` is `BlockNode[]` (`{ id?, type, props?, slots? }`), opaque JSON to the backend. Definitions
and components live in the consumer's `app/blocks/`. `layers/admin`'s `components/BlockRenderer.vue`
renders the tree in-app for the live preview (no public site round-trip, no iframe/postMessage);
`layers/public` renders the same tree for real page delivery.

A block instance may carry an editor-only alias (findable in the block picker's search, shown only in
its fields panel), but the alias never travels inside `body`: it lives in a sibling `blockAliases`
field (`{ type: "json" }`) the preset derives automatically for every collection whose editor is
`"blocks"` and which has a `body` field — a consumer never declares it — so the existing field grants
(`authz.fields`) keep it from anonymous callers on every pipeline that answers the collection —
`resolvePage`, `readPage`, `listPages` and their generic-collection equivalents alike — the same way
they already keep out any other field a consumer excludes. The field is deliberately not localized
(a localized field's name still shows up in `_locales`' per-field origin map, which is granted
anonymously for every other localized field): instead it holds one `id`-keyed alias map per locale,
`{ [locale]: { [blockId]: alias } }`, since block ids differ per locale body. `BlocksBody.vue` reads
and writes only the current locale's map, via `#kestrel-admin/app/utils/block-tree.ts`'s
`withLocaleAliasMap`, leaving every other locale's aliases untouched. That same file's
`stripAliases`/`aliasMapOf`/`withAliasMap` move a locale's alias map between the in-memory `BlockRow`
tree (which keeps it inline, for the picker's search) and the two separately persisted fields.

### The left pane
`BlockTree.vue` with `root` owns the whole pane in one reading order: the page entry (which selects the
page fields), then the section label (`sectionLabel`, "Block structure"), then the block rows and the
add button. DOM order is the visual order, so the keyboard walks it top to bottom. The three leading
boxes are one column: the page entry's icon, the section label's icon and a row's drag handle are all
`1rem` wide, and the text that follows each sits behind the same `3px` accent slot plus padding
(`--block-tree-gutter` / `--block-tree-text-inset`), so labels line up whether or not the row has a
handle. Selection uses the shared `selected-accent` mixin (`assets/scss/_mixins.scss`) — the same
token, width, squared leading corners and background the version-history row uses.

### Block clipboard
`layers/admin/app/utils/block-tree.ts` (`BlockTree.vue`'s per-row Copy/Paste entries in the "More actions" menu and Ctrl/Cmd+C /
Ctrl/Cmd+V, scoped to focus inside `.editor3__tree` so they never shadow a real text copy elsewhere) and
`BlockPicker.vue`'s "Paste from clipboard" entry all go through `useBlockClipboard.ts`
(`layers/admin/app/composables/`). Copy writes the selected block's subtree as JSON to the system
clipboard (`navigator.clipboard.writeText`) under the marker envelope
`{"kestrel":"blocks","version":1,"blocks":[…]}`, and always also to `localStorage` under
`kestrel.blockClipboard` — the fallback used when the Clipboard API is unavailable or its read permission
is denied, and what makes paste work across browser tabs of the same origin without a clipboard-read
grant. Paste reads the system clipboard first (only possible from a user gesture — the keyboard shortcut
and the row/picker buttons all qualify), falling back to `localStorage` when that read fails or the text
doesn't parse.

Normalization is a pure function, `normalizeClipboardBlocks` (`layers/admin/app/utils/block-clipboard.ts`,
unit-tested): every node gets a fresh id via the same injectable generator `useBlockTree`'s `add`/
`duplicate` use (`crypto.randomUUID` by default), a node whose `type` isn't in the target project's
current block registry is dropped (recursively, together with its own children) and its type name is
collected for a "n blocks skipped: …" toast, and every kept node's `props` are filtered down to the keys
its current `SerializedBlock.fields` still declares — the same reconciliation `pruneBlockProps`
(`layers/admin/app/utils/edit-form.ts`) applies before a save. A prop the schema no longer has is
dropped; a field the schema newly requires but the clipboard node lacks stays absent, so client
validation reports it same as an empty field on a freshly added block. Media and link references are
left untouched (same referenced id/instance). The actual splice into the tree — `pasteBlocks`
(`block-tree.ts`, alongside `addBlock`/`duplicateById`) inserting after the focused block or at the end
of the target slot — and the resulting `blocks.value` assignment go through `useBlockTree`'s own `emit`,
i.e. the same `setField`/dirty-tracking/undo-redo path as `add`, `duplicate`, `move` and `remove`.

### Block discovery (`layers/core/modules/blocks`)
A block is a single `.vue` file — schema and template in one place:

```vue
<script setup lang="ts">
const props = defineProps({
  heading: textField({ required: true, label: { en: "Heading", de: "Überschrift" } }),
  image: mediaField({ accept: "image" }),
  cta: linkField(),
});
defineBlock({ label: "Hero", slots: ["default"], icon: "image" });
</script>
```

- **Field factories** (`layers/core/app/utils/field-factories.ts`, auto-imported): `textField`,
  `richtextField`, `slugField`, `numberField`, `booleanField`, `datetimeField`, `choiceField`,
  `linkField`, `mediaField`, `relationField`, `jsonField`, `repeaterField`, plus `field(type, opts)`
  for a consumer-registered custom type. Each returns a **Vue prop declaration** (`{ type, required,
  default }`) that also carries the `SerializedField` under the `Symbol.for("kestrel.field")` key, so
  `defineProps` stays an ordinary runtime props declaration at runtime and the extractor can lift the
  schema out of it at build time. Base keys (`required`, `unique`, `label`, `default`, `condition`) sit
  on the field; everything else lands in `options`. An object/array `default` is handed to Vue as a
  factory (cloned per instance) while the field keeps the literal.
- **`defineBlock(meta)`** (`layers/core/app/utils/define-block.ts`, auto-imported) is a runtime no-op
  returning its argument; only the build-time extractor reads it.
- **Extraction** (`modules/blocks/extract-block.ts`): the SFC's `<script setup>` is parsed with
  `@babel/parser`; the first top-level `defineProps(…)` / `defineBlock(…)` argument object (also found
  inside `withDefaults(…)`, and behind `as` / `satisfies` / `!` / parentheses) is sliced from the source
  and evaluated with the factories in scope. The arguments must therefore be **self-contained literals
  plus factory calls** — an imported constant, a computed value or the type-only `defineProps<T>()` form
  fails the build with the offending file name. A prop with no field definition (`media: Object`) is a
  display-only Vue prop and is skipped; an uncalled factory (`heading: textField`) and a function
  `default` are hard errors.
- **Scanning** (`modules/blocks/scan.ts`): every layer's `app/blocks/*.vue`, in `nuxt.options._layers`
  order (the consumer first), deduped by block name so a consumer file shadows a same-named layer file,
  then sorted — so the block list order in the editor is alphabetical and deterministic. The block name
  is the kebab-cased file name (`BoxedContainer.vue` → `boxed-container`).
- **Virtual module `#kestrel/blocks`**: a written template (`.nuxt/kestrel/blocks.mjs`) exporting
  `blockDefinitions: SerializedBlock[]` (inlined JSON), `blockComponents: Record<string, Component>`
  (static imports of the SFCs) and `imageSizes: ImageSize[]` (the merged, discovered set — see
  **Image variants**). Aliased ahead of `#kestrel/*` in the Vite and Nitro resolvers; its types come
  from the ambient `layers/core/types/blocks.d.ts`, referenced through `prepare:types`. `BlockRenderer`
  (public) imports `blockComponents`; `SystemImages.vue` imports `imageSizes`. Because of the SFC
  imports this module is client/app only — server code must never import it.
- **Virtual module `#kestrel/image-sizes`**: the server-safe twin, a written template
  (`.nuxt/kestrel/image-sizes.mjs`) whose only export is `imageSizes: ImageSize[]` — the same merged
  set, as inlined JSON with no imports at all. Registered as a Nuxt, Vite and Nitro alias
  (`modules/blocks/index.ts`, the same shape as `#kestrel/build-assets`), typed by the ambient
  `layers/core/types/image-sizes.d.ts`, which is both referenced through `prepare:types` and added to
  the Nitro tsconfig `include`. `server/plugins/kestrel.ts` imports its `imageSizes` from here.
- **Picker images and `#kestrel/block-images`**: a `defineBlock({ image: "./Hero.png" })` relative to
  the SFC resolves to a file path at extraction time (`block.imageFile`, stripped back out of
  `blockDefinitions` so no filesystem path ships to the client) and is emitted as its own template,
  `.nuxt/kestrel/block-images.mjs` (`#kestrel/block-images`, `blockImages: Record<string, string>`) —
  one `import` per relative image, so Vite bundles it into the admin chunk. `useBlocks` merges that map
  onto `blockDefinitions` for `BlocksBody`/`BlockTree`'s picker; `blockComponents` and the public
  renderer never reference it, so the file never reaches the public site's bundle or `.output/public`
  outside a hashed `_nuxt` asset. An absolute/`http` `image` stays a plain URL string on `blockDefinitions`.
  Without an explicit `image`, extraction looks for a sibling file with the block's basename and the
  first matching extension in `webp`, `jpg`, `jpeg`, `png` (`extract-block.ts`,
  `SIBLING_IMAGE_EXTENSIONS`/`detectImage`) and uses it the same way as an explicit relative path. A
  consumer can redirect this lookup to one shared directory with `kestrel: { blockImagesDir }` in
  `nuxt.config.ts` (`modules/blocks/index.ts`, `configKey: "kestrel"`); when set, candidates become
  `<blockImagesDir>/<Basename>.{webp,jpg,jpeg,png}` and the sibling lookup is skipped entirely — an
  explicit `defineBlock({ image })` still wins either way.
- **Watching**: `builder:watch` re-runs the extraction for any `.vue` or sibling-image-extension change
  under a block directory (`BLOCK_WATCH_EXTENSIONS`) or any `app/image-sizes.ts` change — plus, when
  `blockImagesDir` is configured, the same extension change under that directory — and invalidates the
  template, so adding a field, a picker image or an image size HMRs into the editor and the preview.
- **Tags**: `defineBlock({ tags: [...] })` extracts onto `SerializedBlock.tags` the same way as `image`/
  `description` — a literal array of kebab-case strings (`^[a-z0-9]+(-[a-z0-9]+)*$`), everything else a
  build error naming the file (`extract-block.ts`, `normalizeTags`). The set of tags offered in the "Add
  block" picker is derived from `blockDefinitions` at render time, not tracked separately. `layers/admin`'s
  `BlockPicker.vue` filters `ctx.allowedTypes` through the pure `filterBlockTypes`/`collectBlockTags`
  helpers (`layers/admin/app/utils/block-picker-filter.ts`): a search box matches `label`/block name
  accent-insensitively, tag chips AND-combine, and both compose across all three picker views. An optional
  label map from the consumer's `shared/block-tags.ts` (`defineBlockTags`, resolved through
  `#kestrel/consumer-block-tags` by `modules/consumer-entries`, see `docs/consuming-kestrel-web.md` §5)
  supplies the chip text, falling back to the raw tag key; it is not
  cross-validated against the tag set in the registry. The search box also matches a block's localized
  `description` (`filterBlockTypes`, same accent-insensitive comparison as `label`/name).
- **Field layout**: `defineBlock({ fieldLayout: [...] })` is optional and takes the same `LayoutNode[]`
  grammar as a collection's top-level `fieldLayout` and a repeater's `options.fieldLayout`
  (`layers/core/app/types/kestrel.ts`) — rows (`{ kind: "row", fields, tracks }`) optionally grouped
  (`{ kind: "group", label, hint?, rows }`), checked recursively. `extract-block.ts` validates it at build
  time the same way as `tags`: every named field must exist among the block's own extracted fields, no
  field may appear twice across the whole layout, a row's `tracks` length (when given) must match its
  `fields` length, and any violation — or a non-literal value — fails the build naming the block file and
  the offending field (`normalizeFieldLayout`/`validateFieldLayout`). Stored on `SerializedBlock.fieldLayout`
  only when present; `BlockFields.vue`'s `KestrelFieldLayout` falls back to one field per row, in
  prop-declaration order, when it's absent — the same default a collection or repeater uses.
- **Source**: `SerializedBlock.source` is the block's own `.vue` path relative to the root, POSIX-separated,
  never an absolute filesystem path, which must not reach the client bundle.
- **Details popover**: each `BlockPicker.vue` item (`BlockPickerItem.vue`) carries an (i) button —
  always visible in the list view, shown on hover/focus in the grid and large views — that opens a
  `KestrelUiPopover` (`BlockPickerDetails.vue`) built from the pure `blockDetails(block, lang)` helper
  (`layers/admin/app/utils/block-details.ts`): the resolved description, slot names (or "No slots"), a
  compact fields table (label, type, required), declared `imageSizes` (name + dimensions) and the
  `source` path. The info button sits next to the pick button as a sibling, not nested inside it, so
  opening details never triggers a pick.
- **Favorites and recently used**: a star toggle per item persists block names to `localStorage`
  `kestrel.blockPicker.favorites` (`useBlockPickerFavorites.ts`, mirroring the tag composable's
  read/try-catch/persist shape); picking a block records it to `kestrel.blockPicker.recent`
  (`useBlockPickerRecent.ts`), capped at 6 entries with dedupe via the pure `updateRecentList`
  (`layers/admin/app/utils/block-picker-groups.ts`). With no search or tag filter active, `groupBlockTypes`
  (same file) splits the picker into "Favorites" and "Recently used" lead groups (each shown only when
  non-empty) ahead of "All blocks"; an active filter collapses back to the single flat filtered list, same
  as before favorites/recent existed.

## Image variants
An image size is a named crop/resize spec (`width`, optional `height`, `fit`, `quality`) that the
backend renders as a WebP variant. Which sizes a site needs follows from the blocks that render
images, so they are declared next to the components that need them and discovered the same way
blocks are — statically, at build time — rather than configured by hand.

### Declaring sizes
Two ways to declare a size, both static object literals read by the block scanner (no composable, no
runtime discovery):

- **Block-owned**: `defineBlock({ imageSizes: [{ name, width, height?, fit?, quality? }] })` inside a
  block SFC (`layers/core/app/utils/define-block.ts`). `defineBlock` itself is a type-level identity
  function with no validation; the sizes are validated when the block scanner extracts them.
- **Free-standing**: a consumer's `app/image-sizes.ts`, a default export calling
  `defineImageSizes([...])` (`layers/core/app/utils/define-image-sizes.ts`, itself just `(sizes) =>
  sizes`) — for images rendered outside a block's own template (teaser lists, hero layouts driven by
  other data).

Both are extracted with `@babel/parser` and evaluated as self-contained literals, the same rule
`extract-block.ts` applies to `defineProps`/`defineBlock`: no imported constants, no computed values.
Validation (`layers/core/modules/blocks/image-sizes.ts`, `normalizeImageSize`) is identical for both
sources:

- `name` must match `^[a-z][a-z0-9-]*$`.
- `width` and `height` (when given) must be integers between 16 and 8192.
- `fit` is `"inside"` or `"cover"`, defaulting to `"inside"` when omitted.
- `fit: "cover"` requires `height` — a build error otherwise.
- `quality` is an integer 1–100, defaulting to 82.
- Only `name`, `width`, `height`, `fit`, `quality` are allowed keys; a declared `format` is rejected
  with its own message (format is fixed to `webp` and is never declared), any other unknown key is
  rejected naming it.
- **Collisions**: sizes are merged across every block and every `app/image-sizes.ts` in
  `nuxt.options._layers` order, keyed by `name`. Two declarations with the same name are fine and
  collapse into one entry *only if they normalize to the exact same spec*; if they differ in any
  field the build fails naming both files (`image size "X" is declared differently in A and B`). The
  merged list is sorted by name.

### Discovery
The existing block scanner (`layers/core/modules/blocks/scan.ts`, `layers/core/modules/blocks/index.ts`)
does the discovery: `collectImageSizeFiles` finds every layer's `app/image-sizes.ts`, `collectImageSizes`
gathers those plus each block's `imageSizes` and calls `mergeImageSizes`. The result is:

- written into the virtual module **`#kestrel/blocks`** as a third export, `imageSizes: ImageSize[]`,
  alongside the existing `blockDefinitions` and `blockComponents` (ambient types in
  `layers/core/types/blocks.d.ts`) — this is what `SystemImages.vue` imports to know the full declared
  set;
- written into the virtual module **`#kestrel/image-sizes`** (`renderImageSizesModule`, ambient types
  in `layers/core/types/image-sizes.d.ts`) as its only export, free of the block SFC imports — this is
  what `server/plugins/kestrel.ts` imports for the boot registration;
- written to **`<consumer>/.nuxt/kestrel/image-sizes.json`** (`renderImageSizesJson`), only when its
  content actually changed. Same rule as `.nuxt/kestrel/pages.body.json`: generated, never hand-edited —
  both carry a `$comment` marker for the same reason.

Both files regenerate on the same `builder:watch` hook that already re-runs block extraction, so
adding a size to a block or to `app/image-sizes.ts` is picked up on save in dev.

### Registration at boot, variants on a button
Registration happens twice, on two different paths, for two different reasons.

At boot, `layers/core/server/plugins/kestrel.ts` hands the declared set (`imageSizes` from
`#kestrel/image-sizes`) to the embedded instance in-process by running the triggerless preset pipeline
`registerImageSizesBoot`. `images-default` keeps code-declared sizes in memory only, so a restarted
instance that skipped this would know its config/default sizes alone and every variant URL of a
declared size would 404. The path has no auth step because it is not a route: it runs inside the boot
sequence, before any request exists, from a module the build generated.

Generating the variants stays an ordinary user action, triggered from **System → Images**:
`SystemImages.vue`'s "Synchronize" button runs `imagesRegisterAndSync`
(`layers/admin/app/actions/system.ts`), which sends the full declared set from `#kestrel/blocks`'
`imageSizes` to `PUT /admin/images/sizes` and then starts a sync job — both over the normal
authenticated API client, gated by the `images.write` and `images.manage` permissions. Resizing every
stored image is expensive and destructive enough to want a person behind it.

Consequence: after a deployment adds or changes a size, that size is declared and registered, but its
variants do not exist until someone clicks Synchronize. Nothing breaks meanwhile — `KestrelImage`
falls back to the original file for any size that has no `done` variant yet (see below), and the tab's
own status view shows the gap: `missingSizes` (declared sizes absent from `GET /admin/images/status`)
and `conflictingSizes` (a declared size whose spec differs from a `source: "config"` row already on the
backend) are computed client-side in `SystemImages.vue` and surfaced as inline alerts. Registration only
ever happens through these two paths, the boot-time in-process call and the admin Synchronize button —
there is no remote-backend registration path, since kestrel-web always boots Kestrel in-process
(`server/plugins/kestrel.ts`).

### `KestrelImage`
`layers/public/app/components/Image.vue` is auto-registered as `<KestrelImage>` by
`layers/public/nuxt.config.ts` (`components: [{ path: …, prefix: "Kestrel" }]`). It is a component, not
a block — the layer does not ship a block, because the consumer owns its block library
(`app/blocks/*.vue`, no registry — see **Consumer contract**). A consumer wraps it in its own block,
e.g. `playground/app/blocks/Image.vue`:

```vue
<script setup lang="ts">
defineProps({ image: mediaField({ accept: "image", required: true }), alt: textField({}) })
defineBlock({ label: "Image", imageSizes: [{ name: "content", width: 1200 }] })
</script>
<template>
  <KestrelImage v-if="image" :media="image" size="content" sizes="(min-width: 60rem) 60rem, 100vw" :alt="alt" />
</template>
```

Props: `media` (a media id string, or an already-fetched `MediaItem` — the component only fetches
`GET /api/media/:id` through `useMediaItem` when given a string id and no inline item), `size` (the
declared size name to prefer), `sizes` (the `<img sizes>` attribute, only rendered when a `srcset` is
present), `only` (restrict the `srcset` candidates to specific size names), `alt`,
`loading`/`decoding`/`fetchpriority` (defaulting to `lazy`/`async`).

`layers/public/app/utils/image-variants.ts` (`pickImageSources`) implements the rules:
- **`src`/`srcset` come only from the item's `path` and `variants[].path`, never constructed.** Every
  media URL is data the API returned; kestrel-web builds none of it from an id. This holds regardless of
  a variant's `state`: an item can be referenced in content only once every declared variant path exists
  (`available`, checked by the admin at insertion time, §**Media availability**), so a listed path always
  resolves, on Node and on a static export alike.
- **The variant named by `size` is looked up regardless of its state.** If found, its `path` becomes
  `src` and its planned `width`/`height` are used, whatever state it is in — `pending`, `done`, `error`
  or `failed` all answer at that path (the original's bytes until a render replaces them, or after one
  fails for good). If the item carries no matching variant (no `images` feature, a non-image file, or a
  format the module does not generate variants for), `src` is the item's own `path` and there is no
  `srcset`.
- **`srcset` candidates are every variant sharing the reference aspect ratio**, deduped by width and
  sorted ascending — the reference is the named variant's own ratio, or the original media's
  `width`/`height` when there is no named variant; `null` (no `srcset`) only when neither is known. This
  exists because the candidates in a `w`-descriptor `srcset` must be the same image at different widths:
  a `cover` crop has a different aspect ratio than the original, and mixing it into the same `srcset`
  would let the browser pick it purely for viewport size or pixel density and render it into a box built
  for a different ratio — a visibly wrong crop, e.g. a content image picking up both `avatar` (96×96,
  square) and `teaser` (480×320, 3:2) in one `srcset`. Consequence for a consumer declaring its own
  sizes: a `cover` size forms its own `srcset` family and is never mixed with `inside` sizes, even when
  both are named through `only`.
- **`width`/`height` come from the named variant's planned dimensions**, decided from the original at
  plan time and identical to what the eventual render produces — never the original's own dimensions
  while a variant is still pending, so `<img width height>` and the `cover`/`inside` box are correct from
  the first render. `KestrelImage` also sets the inline style `aspect-ratio: <width> / <height>;
  object-fit: cover` whenever `src` links a variant, so the placeholder (the original, at its own aspect)
  fills the box the eventual crop will have; an item without variants gets neither style, since its `src`
  is the original at its native aspect.
- **`alt=""` stays possible**: the prop is `alt?: string | null`, and the template's `altText` is
  `props.alt ?? item.value?.alt ?? ''` — an explicit empty string from the block (a purely decorative
  image) is not coalesced away, only `undefined`/`null` fall through to the media's own alt text and
  then to `''`.

### Media URLs
Every media file has exactly one public URL, generated by the module that stores it and returned as data
— `path` on the item, `path` on each entry of `variants[]` — never built from an id anywhere in
`layers/public` or `layers/admin`. `presetModuleConfig()` sets `publicPath: "/media"`
(`MEDIA_PUBLIC_PATH`, `layers/core/mount-path.ts`) on both `media-default` and `images-default`; the Node
server answers it directly, next to the `/api` mount `layers/core` uses for everything else. A base
pipeline `serveMediaFile` runs `media.serve` at `${MEDIA_PUBLIC_PATH}/:id/:name`; the `images` feature's
`serveImageVariant` runs `images.serve` at `${MEDIA_PUBLIC_PATH}/:id/variants/:file`. `server/plugins/kestrel.ts`
builds a second `createKestrelHandler` from the same booted instance, its trigger table filtered to
exactly those two patterns (`server/utils/public-media.ts`, `publicMediaRoutes`) and mounted with no
prefix (`mountPath: ""`); `layers/core/nuxt.config.ts` registers it as a Nitro server handler on
`${MEDIA_PUBLIC_PATH}/**`. The API's own media routes (`GET /api/media/:id`, `/api/media/folders`, …) stay
reachable only under `/api`.

With the `delivery` feature, both media modules also get `publicCopy: { prefix: "site/" }`, so the static
export holds a copy of every file at the same URL the live site uses — nothing to rewrite, so
`delivery-static` stores rendered output byte for byte. `assertMediaPaths`
(`server/utils/media-paths.ts`) runs once at boot, after `kestrel.start()`, and **fails the boot** —
not a warning — when either module's `publicPath` is not `/media`, when the trigger table cannot reach
`media.serve`/`images.serve` there, or, with `delivery-static`, when a loaded media module has no
`publicCopy` under the export's own prefix or `delivery-static.reservedPaths` is missing `/api`, `/admin`
or `/media`.

### Media availability
`images.attach` adds `available: boolean` to a media item: `false` while an eligible image still lacks
one of its declared variant paths, `true` otherwise (including for a file with no variants at all — an
SVG, a PDF, `images` not enabled). No item output ever lists a variant path without an object behind it,
so a page links what exists and needs no republish once a pending variant renders — only its `srcset`
width may change on the next render. The admin uses `available` to gate **insertion**: `MediaLibrary` in
picker mode, and `field/Media.vue` for a restored value, refuse an unavailable item
(`layers/admin/app/utils/media-insert.ts`, `isInsertable`), so a page's first render already links an
item's full set of variant paths. `KestrelMediaThumb` and the rest of the admin's media UI read `path`
from the item like the public layer does; nothing there builds a media URL from an id either.

## Static delivery / renderer contract
`delivery-static` (a backend module) renders every published locale of a page through whatever module
satisfies `renderer@1` and stores the result in the blobstore:

```ts
interface Renderer {
  formats(): string[];                                   // e.g. ["html"] or ["html", "pdf"]
  render(input: { type, id, locale?, path, format, document }): Promise<{
    data: Uint8Array | string; contentType: string; extension: string;
    assets?: Array<{ path: string; data: Uint8Array | string; contentType: string }>;  // _nuxt/*, CSS — for hydration
  }>;
}
```
`path` is the page's eventual public path (e.g. `/en/kontakt`); `document` is the resolved document
(with locale fallback applied). `packages/renderer-nuxt` implements this using `layers/public`'s own
Nitro rendering (`localFetch`); the contract test is
`@michaelthielemann/kestrel-contracts/renderer.contract.test`.

**Build assets.** A statically served page needs the hashed `/_nuxt/*` files its markup and chunks load
(including lazy-chunk CSS listed only in Vite's `__vite__mapDeps` and Nuxt's app manifest under
`_nuxt/builds/`), so the renderer ships the *whole* build assets directory rather than walking
references: `layers/core/modules/build-assets` writes the file list of `.output/public<buildAssetsDir>`
into the `#kestrel/build-assets` template during `nitro:build:public-assets` (Nuxt fires it after
`copyPublicAssets`, before the server bundle is rolled up, so the list is baked into the server); the
Nitro plugin registers it as `buildAssets: { dir: app.buildAssetsDir, paths }` plus `baseURL` on the
`NuxtTarget`, unless `app.cdnURL` is set (the markup then points at the CDN and nothing is synced). The
renderer fetches every path through `localFetch` under the baseURL once per process (16 at a time), keeps
the bytes in memory and returns them with every render under site-relative keys; `delivery-static` writes
each key once per process (`<prefix>_nuxt/…`). An empty manifest is a publish
error, never a page without assets. `.gz`/`.br` siblings (`compressPublicAssets`) and `.map` files are
not exported. Old hashes are never deleted from the blobstore. Files in the consumer's `public/`
directory (favicons, fonts, `robots.txt`) are **not** part of `site/`; serve them next to it.

**Publishing needs a production build.** Against `nuxt dev` the markup references Vite source URLs
(`/_nuxt/@fs/…`, `…?vue&type=style…`) that exist only on that dev server, so `render()` throws
(`target.dev`, plus a markup check as safety net) and every publish — including the one that runs on
each page save — ends in delivery state `error` with that message; the previously published file stays.
Run `nuxt build` and `node .output/server/index.mjs` to publish.

Site URL resolution: the primary locale is never prefixed (`/kontakt`), other locales are
(`/en/kontakt`); the start page is the document with slug `home` (`/` → home).

### What the export holds

| Path on the static host | Written by | Lifecycle |
|---|---|---|
| `<path>/index.html`, the page; `<html>` carries `data-kestrel-delivery="static"` and `data-kestrel-build="<build id>"` | `delivery-static` through `renderer-nuxt` | per page and locale: written on publish, moved on a path change, removed on unpublish; replaced atomically on a filesystem store |
| `_nuxt/**`, the build assets and the app manifest (`builds/`) | `renderer-nuxt` assets | written once per process, never removed |
| `media/<id>/<name>`, `media/<id>/variants/<size>.<ext>` | `media-default`, `images-default` (`publicCopy`) | per media item, independent of page publishes; removed with the item |
| `redirects.json`, `llms.txt`, `llms-full.txt` | `redirects-default`, `delivery-static` | on their own triggers; read by the edge and by crawlers, never by the app |

There is no separate data file: the page HTML is both what a visitor loads and what client navigation
reads. `/api` is not part of the static target. A deployment may forward it to the origin for features
of its own, but the exported app never depends on that route.

### How the browser tells an exported page from a live one

`renderer-nuxt` inserts `data-kestrel-delivery="static"` into the `<html>` tag of every page it renders
for delivery, after fetching it; no response of the Node server carries it. `isStaticDelivery()`
(`layers/core/app/utils/static-delivery.ts`, auto-imported) reads it in the browser and is `false` on
the server. Markup never depends on it, since the server renders every page as a live page and hydration
would mismatch; it switches two behaviours only, client navigation and `useApi()` reads.

`data-kestrel-build` is rendered by the app (`layers/public/app/plugins/build-attribute.ts`) on every
public page, live or exported, with the value of `useRuntimeConfig().app.buildId`, which the page
already carries in `window.__NUXT__.config`.

### Client navigation on a static page

With the marker present, `layers/public/app/plugins/static-delivery.client.ts` registers one global
route middleware. It skips the navigation that hydrates the page and any navigation that stays on the
same site path (`sitePath()`: `/about/` stands for `/about`). For every other
navigation it fetches the target's exported document (`<app.baseURL><path>`, `redirect: "error"`,
`Accept: text/html`), parses it with `DOMParser` (scripts in a parsed document never run), revives the
`__NUXT_DATA__` payload with devalue and Nuxt's payload revivers (`nuxtApp._payloadRevivers`, without
the `Island` reviver, so reading a page never fetches `/__nuxt_island/…`), and writes the payload's `data`
into `nuxtApp.static.data`, where `useAsyncData`'s default `getCachedData` looks outside hydration, the
same way Nuxt's own payload loader does. The keys the previous navigation added are removed first. The
target's `state`, `once` and `_errors` are not applied. A navigation that a newer one has superseded
(another click, Back, a hash link) while its fetch was pending does nothing when the fetch settles: it
neither writes data nor leaves for a document load.

The fetched document is used only when the request succeeds without a redirect, the status is 2xx, the
content type is `text/html`, `<html>` carries the marker and the running build's id, the payload is
embedded (no `data-src`), was rendered on the server (no `data-ssr="false"`), is a devalue array that
revives and holds no server component (island), names the target's site path as its `path` (Nitro records
it without `app.baseURL`; a base in front of it is removed only at a segment boundary), and holds
`site:<path>`. Otherwise the navigation becomes one document load of the target URL: `location.assign`
after a click, `location.reload` when the browser already shows the target (Back and Forward). The
console gets one warning per path naming the reason, and the host, or the edge in front of it, answers
the load with the page, a redirect or its 404. A link to a redirected path is therefore redirected by the
edge, since the fetch refuses the redirect; a link to an unpublished page ends in the host's 404; a page
of another build is loaded as a document. Requiring `site:<path>` keeps `[...slug].vue` from ever
missing its own data on a static page; a Nuxt page of the consumer that is not a page document always
takes the document load. Links are not prefetched, so a navigation costs exactly one request, the target's
HTML, which the HTTP cache keeps for a later reload of the same page.

The static host must not answer an unknown path with another page's HTML (an SPA fallback such as
`try_files … /index.html`): the path check turns that into a document load, and the wrong page then
hydrates into a client-side error page.

`/about/index.html` is a file path, not a page path: the Node server answers it with 404, as the API
does. On the static host the file exists; a document load of it hydrates as `/about`, because Nuxt
takes the route from the path the page was rendered for, and a client-side link to it fails the path
check and becomes a document load.

### `useApi()` on a static page

On a page with the marker, `useApi()` sends no `GET` or `HEAD`. It rejects with
`ApiError(404, "GET /api<path> is not available on the static site; a page's data comes from its HTML",
"STATIC_DELIVERY")` and warns once per request. The message names the full API path, so a refused
`/api/media/<id>` read is not mistaken for the media file URL `/media/<id>/<name>`, which the static host
does serve. Callers that treat a 404 as "nothing there", such as `useMediaItem()` and
`useSiteSettings()`, stay quiet. Other methods are sent unchanged; they need the origin and work only
where the static host forwards `/api/`. Reads stay refused even then: a static page shows its published
snapshot and never mixes in live data.

### Freshness of an exported site

Each exported page is a snapshot of its last publish, including the shared data it embeds: settings,
navigation, locale links, resolved link paths and media metadata. Client navigation reads the same
snapshot a full load of the target shows. Within one visit the header and navigation come from the page
the visitor entered on, since every new layout instance reuses the settings key that is still alive, and
the content comes from each target page. A settings change, a renamed page or any other change a page
shows renders the affected pages again in the background (see "Dependent re-rendering"). Until the last of
them is done, one visit can show pages of different ages, a locale switch reads the target's settings as
last rendered, and a link to a renamed page answers 404 through a document load; no redirect is created
automatically. After a new build, pages not yet rendered again carry the old build id, and navigating to
them is a document load until their background render has run.

### Only public data in an exported page

An exported page, and therefore the data client navigation reads from it, holds only what an anonymous
visitor may see on that published page: no draft, no preview, no unpublished translation, no internal
media field, no timestamp, no user or audit data. Five things keep it so.

1. **The render is anonymous.** `renderer-nuxt` calls `NuxtTarget.fetch(path)` with the path only, and the
   layer's target (`layers/core/server/utils/renderer-target.ts`) is `nitro.localFetch(path)`: a new
   in-process request without cookie, `Authorization` or forwarded headers, whatever request triggered the
   publish. Every read during the render runs with the anonymous role's grants and the public status
   filters. Previews never render on the server (`/_preview/**` is `ssr: false`).
2. **The server cuts every public read.** Each read an anonymous caller reaches ends with
   `authz.fields` (see **Public reads and field grants**), so the render receives only the fields the
   anonymous grants name.
3. **Navigation data is the exported HTML.** Nothing reaches the browser by navigation that the page's
   own HTML does not already hold.
4. **The layer stores public shapes.** `site:<path>` is `toPublicPage()` of the `resolvePage` answer: the
   page without its timestamps; `site:locales:<id>:<locale>` is `{ locale, path, current }[]` of published
   siblings; `site:settings:<locale>` holds the five fields of `toSiteSettings`; `media:<id>:<locale>` holds
   what `toPublicMedia()` (`layers/public/app/utils/public-shapes.ts`) keeps: no library folder, no
   timestamps, no variant counts, no variant state, and an empty `variants` list for an item a preset
   without `images` answers. On the export these transforms change nothing, since the render is
   anonymous; on the Node site, with the derived grants, they keep a signed-in editor's page data equal to
   a visitor's. A consumer who narrows the `pages` grant in `roles.anonymousFields` narrows only the
   visitor's answer: the editor's page data then keeps the fields visitors lose.
5. **A test that fails on a leak.** `layers/public/static-export.e2e.test.ts` (run with
   `KESTREL_STATIC_E2E=1`) builds the playground, publishes a German page whose English translation is a
   draft, a draft page, a media item in its own folder and an English page whose German original is a
   draft, runs Publish all as a second user and waits for its background renders, and checks that none of
   their marker strings reaches any exported file, that every payload key keeps its public shape, and that
   an exported payload equals an anonymous render of the same path, and that the Node origin renders every
published page the same for a visitor, a signed-in editor and an editor who logged out. It runs once with the inline event
   delivery and once with the queue (`KESTREL_PLAYGROUND_EVENTS_QUEUE=1` on the same build), and in both
   changes the settings, a media item's alt text and a page's slug to check that exactly the pages showing
   them are rendered again.

A consumer's own `useAsyncData` results are exported the same way; `docs/consuming-kestrel-web.md` §8
lists the rules for them.

### Dependent re-rendering

An exported page is refreshed when content it shows changes. The recording and the marking are
`delivery-static`'s (its README, "Dependent outputs"); the layer supplies what they need:

- **Reads happen where they can be seen.** A render is `nitro.localFetch(path)` in the process and async
  context of the publish; every `useApi()` read of the page, its layout and its blocks goes through the
  in-memory Nitro handler to the kestrel instance, whose providers note what they answer. The layer keeps
  no server-side cache of `/api` answers, which would hide such a read. `presetModuleConfig()` sets
  `rendererReadsDocument: true`, so a render that did not read its own page (a lost read scope) is stored
  with unknown dependencies and re-rendered on every change instead of going stale.
- **Every change raises an event.** Collection writes already emit `<event>.created|updated|deleted|…`;
  `setSettings` and every single collection's `set<Name>` gain an atomic group and emit
  `settings.updated` / `<name>.updated`. `features/delivery.ts` composes one dependents pipeline per
  collection plus `settingsDependents` and `mediaDependents`; `definePreset()` drops each dependents trigger
  whose event neither a composed pipeline (after `exclude` and `overrides`) nor a configured module
  (`MODULE_EMITS`: `images-default` raises `images.variantsChanged`) emits, so boot has no trigger without
  an emitter.
- **Renders run outside the request.** With `eventsQueue`, `delivery-static` raises `delivery.outputStale`
  per marked page and language (`render: "events"`), `republishOutput` renders it and `refreshLlms` writes
  `llms.txt` after a coalesced `delivery.llmsStale`; both run in the queue's `pages` lane (`lanesFor`).
  Without the queue, `render: "background"`: the module's own loop renders in the marking process.
  `definePreset()` refuses a render mode that does not match the event delivery module, and a lanes config
  that leaves the two pipelines out of a lane of their own.
- **A deploy re-renders.** The Nitro plugin runs `deliveryBuildCheck` after `start()` with
  `useRuntimeConfig().app.buildId` (`server/utils/build-check.ts`), except in dev, before it reports ready. A
  new build marks every output, so every page is rendered, and its dependencies recorded, by the deployed
  code.
- **The admin reads the backlog.** `pagesStaleStatus` feeds `useStaleStatus()` (polled every two seconds
  while pages wait, paused while the document is hidden) for System › Static delivery and
  `DashDeliveryStaleAlert.vue`; the publish status rows carry `stale`, `staleFailed` and `staleError` for
  the editor's delivery line. The save and delete messages fold only the `publishPage`/`unpublishPage`
  entries of `_events` (`ownDeliveryStatus()`), since a save now also queues marking work.

## `NUXT_PUBLIC_SITE_URL`
`layers/admin` reads `runtimeConfig.public.siteUrl` (env `NUXT_PUBLIC_SITE_URL`) for anything that needs
the public site's absolute base URL — the editor status's "open page" link, shown once a page is live
(`EditorStatus.vue`, computed in `pages/admin/[collection]/[id].vue`) — and canonical URLs
(`SeoFields.vue`). Empty by default; set it in a consumer's `.env` once the public site has a real host.
`presetModuleConfig()` also passes it to `delivery-static`'s `llms.siteUrl` unless the `llms` option
carries one, so llms.txt lists absolute URLs rather than paths.

## Public site (`layers/public`)
`app/pages/[...slug].vue` resolves `/api/site<path>` through `useApi()` (in-process `localFetch` during
SSR), renders the document with `KestrelBlockRenderer` and sets `<head>` from `seo`. Its data keys are
deterministic, so a server-rendered key is found again on client navigation of a static page: the page
under `site:<site path>` (`sitePath()` maps `/about/` to `/about`), its locale
links under `site:locales:<id>:<locale>`, the site settings under `site:settings:<locale>`
(`useSiteSettings()`, shared with the layout) and media items under `media:<id>:<locale>`
(`useMediaItem()`). A key that depends on the locale carries it instead of watching it, since inside a
page the route, and with it the locale, is fixed for that page's instance.
`app/layouts/default.vue` draws header (site title + `settings.navigation`, resolved — see below),
locale switch (`_translations` decides which locales exist) and footer; `app/assets/css/site.css` is
imported only there, so admin and site styles never mix. Locale comes from the path (`/en/…`;
`prefixPrimary` from `shared/model.ts`).

#The document title and `<html lang>` are set by the pages themselves (`[...slug].vue`, `_preview/[key].vue`):
`title` = SEO title or page title, `titleTemplate` appends the site title from `settings.title`. A consumer
layout does not have to repeat this; it only renders the chrome.

`<meta name="description">` and `og:description` follow the same shape: `metaDescription(seo.description,
siteSettings.description)` (`app/utils/site-settings.ts`) takes the page's SEO description and falls back
to the `description` field of the `settings` singleton in the current locale — a blank-only value counts
as unset, and when both are empty no meta tag is rendered at all. The site value reaches the page through
`useSiteSettings()`, whose mapping (`toSiteSettings`) lives next to it in `app/utils/site-settings.ts` so
it can be unit-tested without Nuxt. In the admin, `SeoFields.vue` shows that inherited value as the
description field's placeholder and in the SERP preview (`useSiteDescription(locale)` reads
`GET /settings` once per locale), so an empty field shows what will actually be delivered.

## Layouts
`[...slug].vue` and `_preview/[key].vue` opt out of Nuxt's route-meta layout (`definePageMeta({ layout:
false })`) and render `<NuxtLayout :name="resolvePageLayout(page.layout)" fallback="default">`
themselves, so the record's own `layout` column — not the route — picks the frame.
`resolvePageLayout` (`app/utils/page-layout.ts`) coalesces every empty/non-string form to `'default'`;
an unknown (e.g. deleted) name passes through unchanged and `fallback` catches the miss at render time,
so a page never renders with no frame at all. The offered names come from `#kestrel/layouts`
(`kestrelLayouts: string[]`) — every layer's and the consumer's `app/layouts/*.vue`, minus the admin
shell, collected by `layers/core/modules/blocks/index.ts` in the `app:resolve` hook (Nuxt has already
done the layer-ordered, name-first dedup) and written to a `kestrel-layouts.mjs` template. The public
layer ships `app/layouts/default.vue`, so a consumer with no layouts of its own still renders normally.

### The rendered page in state
`useSitePage()` (`app/composables/useSite.ts`) is a `useState<PublicPageDocument | null>('site:page', ...)`,
written reactively — not in `onMounted` — by both `[...slug].vue` and `_preview/[key].vue` as soon as
`page` resolves, so it is set before their `<NuxtLayout>` (and therefore the layout's own components,
e.g. a header) renders on the same pass, on the server and the client alike; a layout/component that only
reads it (never assigns) stays consistent between SSR and hydration. It carries the same page
`KestrelBlockRenderer` gets, without its timestamps, including any consumer-defined field beyond the
reserved ones (via the page's inherited index signature) — a layout reaching for a per-page value (e.g. a
page-specific header CTA) reads `useSitePage().value?.someField` and casts it itself; kestrel-web has no
notion of that field's name or type.

### Preview
`BlockPreview.vue` (`layers/admin`) shows the editor's live preview as an `<iframe :src="/_preview/<key>?embed=1">`
instead of rendering `KestrelBlockRenderer` in the admin DOM — the iframe runs `_preview/[key].vue`
through the public layer's own layout and CSS, so header/menu/footer and site styles render for real and
never leak into the admin bundle. The snapshot channel (`app/utils/preview-channel.ts` —
`sessionStorage` + `BroadcastChannel`) keeps the iframe's content in sync with unsaved editor changes;
`BlockPreview` also publishes a snapshot synchronously before the iframe's first load so
`readPreviewSnapshot` on mount already has data.

`BlockPreview`'s `buildPreviewSnapshot` builds `PreviewDocument` from `ctx.values` generically:
`id`/`slug`/`title`/`body`/`seo`/`layout` stay explicit (editor-owned or, for `body`, sourced from the
live block tree rather than raw form state), and `buildPreviewDocument` (`preview-channel.ts`) then
copies every other renderable field (`Object.keys(pageFieldsBindings.value.fields)` — the same set
`PageFieldsPane` renders) across from `values` by name, so a consumer field never needs
`BlockPreview.vue` to know its name. `_preview/[key].vue` turns the snapshot back into a
`PublicPageDocument` with `previewPageDocument` (same file), which spreads the whole `PreviewDocument`
through and then pins `status`/`shareImage` to `null` — those two are never meaningful in a preview.

The editor and the preview iframe are different documents, so block selection crosses that boundary via
`postMessage`. `app/utils/preview-messages.ts` defines three message shapes: `kestrel-preview:select`,
`kestrel-preview:selected` and `kestrel-preview:ready`. `parsePreviewMessage` checks `event.origin` against
`window.location.origin` on both sides and drops anything else, and `BlockPreview` also checks
`event.source` against the iframe's `contentWindow` before acting on a message. The preview page posts
`ready` from `onMounted` once its own message listener is registered (client-only mount plus an awaited
`useSiteSettings` in the layout otherwise make the very first `select` reply arrive too early to be heard);
`BlockPreview` replies with `selected` on `ready` and on every `selectedId` change. `?embed=1` puts
`KestrelBlockRenderer` in `editable` mode inside the preview page — a block click posts `select` to
`window.parent`, the parent replies with `selected` to keep the tree pane and the iframe's outline in sync.
A capture-phase `click` listener on the preview page's `document` prevents default on any `a[href]` click
(stopping in-iframe navigation, including `NuxtLink`s in the layout's header/footer) and deselects when the
click did not land on a `.block-marker`, covering clicks on blocks, on chrome outside the article, and on
empty canvas alike.

`?embed=1` also adds a `kestrel-embed` class to `document.documentElement`; `site.css` neutralises
`body { margin: 0 }` under that class. `BlockPreview` sizes the iframe itself (not its document) from the
width/height inputs, scaling it for the viewport presets; when height is `"auto"` it fills the space
available in the admin's preview stage, measured with a `ResizeObserver` on that stage container. The
refresh button republishes the snapshot and forces a reload by reassigning the iframe's `src`
(`iframe.src = ''` then back), since `contentWindow.location.reload()` can throw or reload the wrong
document once the user has navigated inside the iframe.

### Untranslated pages
`GET /site<path>` finds a page only through the requested locale's own slug and resolves with
`fallback=true`, so a translation with its own slug but missing other edits still resolves — the response carries `_locales` (per field: which locale actually owns the value) and
`_translations` (which locales have all required localized fields). `fallback=true` is used only to
find the document and compute its primary-locale path (`layers/public/app/utils/untranslated.ts`,
`isFallbackDocument` / `primaryPathOf`); the fallback content itself is never rendered. `[...slug].vue`
applies `shared/model.ts`'s `untranslatedPages` policy — `"redirect"` (302 to the primary-locale page)
or `"notFound"` (404) — so a consumer never serves a page whose content for that locale wasn't released.

### Redirects
When a `redirects` content type is configured (`kestrel-redirects-default`), `GET /site/*path` may
answer `{ redirect: { to, status } }` instead of a document — a rule matched ahead of page resolution.
`[...slug].vue` checks the `/site` response for a `redirect` key before treating it as a page
and calls `navigateTo(to, { redirectCode: status, external: /^https?:/.test(to) })`, which answers a
real 30x during SSR and performs the equivalent navigation client-side. Rules are edited under
**System → Redirects** (a `field/Repeater.vue` over the `rules` json field); a 400 from `PUT /redirects`
(`redirects: Row N: …`) is mapped back to that row by `useEditForm`.

### Navigation link resolution
`settings.navigation` entries store a `link` value (internal/external only — the same shape the admin
`link` field emits, restricted to those two types here), not a raw path. `getSettings`
(`layers/core/pipelines/base.ts`) appends `site.resolveLinks:settings` after `content.get:settings`, the
same step `resolvePage` runs over page bodies, filtered to `status=published` — a link to an unpublished
or missing page comes back with `broken: true` set inline on the link value itself, not nested under a
separate `_links` key, and without a `path`. `useLinkHref` (`app/composables/useLinkHref.ts`) turns a
resolved entry into an href (`null` for external/email/tel with no value, or a broken internal link);
`default.vue` renders `item.children` one level deep and a broken entry as plain text, never a dead link.
The admin editor reads settings through the same `getSettings` pipeline it writes through, so
`useEditForm`'s `rebaseline` strips `path`/`broken` off any internal link value before it becomes the
form's baseline (`stripLinkResolution` in `layers/admin/app/utils/edit-form.ts`) — otherwise the
resolved document it loaded would round-trip back into `PUT /settings` and fail the write schema's
`additionalProperties: false`.

## Renderer (`packages/renderer-nuxt`)
Kestrel module `renderer/nuxt` fulfilling `renderer@1`: `render({ path })` calls the running Nitro's
`localFetch(path)` (under `app.baseURL`) and returns the SSR HTML, marked with
`data-kestrel-delivery="static"`, plus the complete build assets directory; a dev server is refused — see
"Static delivery / renderer contract" above. A page without an `<html>` element, without an embedded
`__NUXT_DATA__` payload, rendered with `ssr: false`, or keeping its payload in a separate `_payload.json`
(an `isr` or `cache` route rule) is refused with `RENDER_FAILED` naming the cause, since it could not
hydrate on a static host. The core layer's
Nitro plugin registers `localFetch`, `baseURL` and the build-assets manifest via `setNuxtRenderer()`
before `boot()`, so `delivery-static` renders inside the same process when a page is published.
`pnpm test` runs the `renderer.contract.test` against it.

## Block schema
`layers/core/block-schema.ts` turns the extracted definitions into JSON Schema 2020-12; the blocks
module writes it to `<buildDir>/kestrel/pages.body.json` (`.nuxt/kestrel/pages.body.json` with the
default `buildDir`) on every build, `nuxt prepare` and watch change (only when the content actually
differs). The file is **generated — never hand-edit it**: it is the contract the backend validates
against, regenerated by the Nuxt build that must run before a production boot, so nothing needs to be
checked in.

The module also injects `process.env.KESTREL_BLOCK_SCHEMA` (the absolute path of that file) into the
Nitro build, so a consumer's `kestrel.config.ts` never has to know where the generator writes:

```ts
{ use: "@michaelthielemann/kestrel-validate-jsonschema",
  config: { schemas: { "pages.body": here(process.env.KESTREL_BLOCK_SCHEMA ?? "./.nuxt/kestrel/pages.body.json") }, watch: process.env.NODE_ENV !== "production" } }
```

With `watch: true` the validator re-reads the file whenever the blocks module rewrites it, so a block
SFC edit is live in the editor, the preview and the validator without a restart. Production boots once
with the checked-in schema.
