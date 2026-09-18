# Changelog

## Unreleased

### Added

- `GET /api/admin/schema` (consumer-visible): the content model, collection UI, workflow and features in
  one answer, `{ locales: { all, primary, prefixPrimary }, collections: SerializedCollection[], features:
  Feature[] }`, typed as `AdminSchema` in `#kestrel-admin/types/api`. The route runs the new preset
  pipeline `adminSchemaModel` (`authn.requireUser`, `content.describeModel`, no trigger — the Nitro route
  starts it) with the request headers and the client IP, resolved by Kestrel's own `clientIp()` under the
  same trust-proxy policy the h3 adapter uses, so the session and the rate limits are checked by the
  backend; a run status of 400 or above is passed through with the backend's own error body, and while
  Kestrel is booting or failed the route answers the same 503 `{ state, error? }` the `/api/**` handler
  answers. The 200 carries `cache-control: no-store`, `x-content-type-options: nosniff` and
  `x-kestrel-run-id` like every other backend answer. `buildAdminSchema` in
  `layers/core/server/utils/admin-schema.ts` is the pure assembly, frozen against
  `layers/core/server/__fixtures__/admin-schema.json`. Needs
  `@michaelthielemann/kestrel-content-default` 5.3.0 or newer.
- `CollectionUi.workflow` (`{ field, live, draft, done? }`, consumer-visible): the field and values behind
  the status light, the publish button and the public-site filter. `defineCollectionsUi(map, collections)`
  checks a declared workflow against the model — the field must exist and be `type: "enum"`, and
  `live`/`draft`/`done` must be among its `options`, with collection and field named in the error; a
  workflow declared without the content types throws and asks for `defineCollectionsUi(map, contentTypes)`.
  A declared workflow also replaces the reserved `draft`/`finished`/`published` check on a `status` field,
  so `workflow: { field: "status", live: "live", draft: "entwurf" }` works.
  `resolveWorkflow(name, model, ui)` (`#kestrel/collections-ui`) derives
  `{ field: "status", live: "published", draft: "draft", done: "finished" }` from a reserved `status` enum
  when no workflow is declared, so existing behaviour is unchanged.
- `definePreset({ collectionsUi })` (consumer-visible): the public `list`/`read` pipelines of a `multi`
  collection filter on `?status=<workflow.live>` (URL-encoded) instead of the hardcoded
  `?status=published`; a collection that resolves to no workflow gets no filter at all. A boot guard in
  `layers/core/server` (pure check in `server/utils/status-filter.ts`, run before Kestrel is reported
  ready) fails the boot when a collection declares a workflow that never reached `definePreset`, naming
  the collection, the expected filter and the fix — otherwise that collection would serve every status
  anonymously. Pipelines a consumer overrode or excluded are left alone.
- `SerializedCollection` gains `workflow` and `editorOwned`, so a client no longer needs the collection
  UI map next to the serialized collections.

- Admin kit: `KestrelUiButton` variants `icon` (square, icon-only, `size` sm/md/lg, caller supplies
  `aria-label`) and `bare` (native button semantics without styling, for cards, tiles and tree rows);
  both keep their rules in `:where()` so call-site classes win, with the focus ring outside it;
  `focus()` works on both branches. `KestrelUiFileInput` (`multiple`, `accept`, `open()`, `select`
  emitting `File[]`). `KestrelUiTable` `plain` for tables inlined in a card.
- `docs/consuming-kestrel-web.md`: "Switching an existing `kestrel.config.ts` to the builder", five
  steps from a hand-written module list to `presetModuleConfig()`.
- `#kestrel/pipelines` exports `presetModuleConfig({ dataDir, blobstore, model, features, roles,
  bootstrap, media?, ratelimit?, llms?, migrations?, session?, overrides? })`: the `modules` list with
  exactly the modules the features imply, in the canonical order, with media locales, references
  targets, delivery types, both `publicPath` values and the validate-jsonschema schemas derived;
  `blobstore`, `roles` and `bootstrap` have no default and throw when missing; `overrides` shallow-merges
  per-module settings the builder does not expose and rejects a module that is not enabled. A
  consumer's `kestrel.config.ts` is about 25 lines.
- `#kestrel/config`: `kestrelDataDir()`, `requiredEnv(name)`, `adminPasswordHash()` and
  `envBlobstore(dataDir)`; a production run without `KESTREL_ADMIN_PASSWORD_HASH` or an S3 store
  without its variables throws while the config loads, naming the variable.
- Admin: block tree rows with a validation error show red text, a labelled error icon and
  `aria-invalid`; ancestors of a nested error get a dot with accessible text; the save-error banner
  gets a button that focuses the first erroneous block. Blocks reorder by dragging a per-row handle with
  a drop indicator, through the same path as the arrow buttons; a live region announces the new
  position.
- Admin: media uploads show per-file progress (`useUploadTransport`, XHR with the same token and error
  mapping as `useApi`), a "generating variants" state after 100 %, a `role="status"` summary that
  disappears when nothing is left, and failed items that stay until dismissed.
- Admin: every password dialog (own account, set password, create user) requires a confirmation;
  a mismatch is rejected inline before any request.
- Admin: the insights config table shows `set`, `default` and `missing` (backend `status`, with a
  fallback to the boolean `set` for backends without it).
- `defineBlock({ fieldLayout })` lays out a block's own fields with the same `LayoutNode[]` grammar as
  a collection's `fieldLayout` and a repeater's `options.fieldLayout`; the block extraction validates
  it at build time (unknown field, duplicate field, `tracks` and `fields` length, groups recursively)
  and the block editor renders the rows. The key is optional; without it every field keeps its own row.
- A third vitest project, `components` (`environment: "nuxt"` via `@nuxt/test-utils`, jsdom), renders
  `*.dom.test.ts` specs with `mountSuspended` against the playground app: keyboard, ARIA and emit
  behaviour of `field/Repeater.vue` and `BlockTree.vue`, the save path of `CollectionEditor.vue`
  (dirty keys only, success toast, 400 field error mapped onto the field) and `sanitizeInBrowser`
  (script, inline handlers, `javascript:` links and iframes removed; safe formatting kept).
- `eventsQueue` preset feature: wires `@michaelthielemann/kestrel-events-queue` (alternative to
  `kestrel-events-inmemory`) with `eventsQueueStatus`, `eventsDead`, `eventsRetryDead`,
  `eventsRetryOne` (`GET /admin/events/status`, `GET /admin/events/dead`, `POST /admin/events/retry`,
  `POST /admin/events/dead/:id/retry`, all `system.manage`) and `purgeEvents` (nightly cron). The
  admin System page gets an "Events" tab (`SystemEvents.vue`) with queue/worker stats, a dead-letter
  table and retry actions. `definePreset` throws when both events modules are configured, and when
  `eventsQueue` is enabled without any event trigger in the final trigger list. `presetModuleConfig()`
  emits `events-queue` instead of `events-inmemory` when the feature is on and takes its config from
  the new `eventsQueue` option.
- `#kestrel/pipelines` exports `definePipeline`, typed against `PresetStep`, so a misspelled step in
  a consumer's own `pipelines/index.ts` fails `nuxt typecheck`; `pipelineDefiner` is documented for
  consumers with modules of their own. `#kestrel/consumer-pipelines` and `#kestrel/consumer-modules`
  carry ambient types (`layers/core/types/consumer-entries.d.ts`).
- `featureOrder` and `staticPipelineNames` are runtime values of `#kestrel/pipelines`; invariant
  tests tie them to the `Feature` union, to the pipeline names `definePreset` generates and to the
  features table in `docs/consuming-kestrel-web.md`. The module registry is tested against the
  `@michaelthielemann/kestrel-*` dependencies in `package.json`.
- `layers/core/server/boot.test.ts` boots the playground config through the real `boot()` and
  `kestrel.run()` in CI: pipeline resolution, the login → `auth.loggedIn` → `auditAuth` chain, the
  upload limit and inline types derived from the booted registry, and a mistyped step failing boot
  with a `KestrelBootError`.
- Admin: UI step names are a typed union (`uiStepNames`, `defineUiStep`) with a registry test;
  `runAction` rethrows unexpected step errors in development and flags them `meta.unexpected` in
  production, where the editor, list and upload composables show a dedicated toast.
- Admin: a failed backend boot shows a full-page notice instead of the login page (`GET /api/ready`
  with `state: "failed"`); the server also prints a multi-line banner with module and reason.
- Public site: the block marker of the preview is keyboard-operable (`role="button"`, Enter and
  Space on the focused marker, visible focus ring).
- Tests for `sanitizeIconSvg`, the server-side HTML sanitizer, `collections.ts` and the block
  marker attributes.

### Changed

- **Breaking (admin client):** the admin reads its schema from `GET /api/admin/schema` instead of
  importing consumer TypeScript. `grep -rn "~~/shared" layers/admin` is empty; `#kestrel/blocks` and
  `#kestrel/consumer-block-tags` stay. `useSchema()` (`useState('kestrel-schema')`) requests the answer
  once per admin session — loaded by the `admin-auth` middleware after a successful session check and by
  the login page after a successful login, cleared by `useAuth().reset()` (logout, the 401 interceptor).
  Concurrent calls share one in-flight request. A 401 is left to the `$fetch` reauth interceptor, which
  already resets the session and navigates to the login page; every other failure keeps its message and
  the admin layout shows `BootFailure` instead of the page, with no fallback schema.
  `shared/model.ts` and `shared/collections-ui.ts` are unchanged for consumers — they stay backend
  configuration and are now read server-side by the route.
- **Breaking (admin client API):** the static exports of `layers/admin/app/utils/collections.ts` became
  functions over the schema — `collections(schema)`, `findCollection(schema, name)`,
  `editorOwnedFields(schema, name)`, `contentLocales(schema)`. `useFeatures().features` is a `ComputedRef`
  rather than an array, and `useContentLocales()` answers `{ locales, primary, prefixPrimary }` as
  `ComputedRef`s rather than a snapshot taken at setup time. `EditFormPort`/`EditorExpose` carry `workflow: Workflow | undefined` in place of
  `hasStatus: boolean`, and `bulkSetStatus` takes `{ workflow, live }` in place of
  `status: 'published' | 'draft'`. Only code that imported these admin internals is affected.
- Publish state comes from the collection's `workflow` everywhere in the client: the status light
  (`EditorStatus.vue`), publish/unpublish, the bulk bar, the list's status cell and the public site's
  locale-link filter (`layers/public/app/pages/[...slug].vue`, via `resolveWorkflow` over the consumer's
  `shared/model.ts` and `shared/collections-ui.ts`). A collection without a workflow now gets no status
  light, no publish button and no bulk status actions instead of writing a value its model does not know.
  A consumer that renames the values — `workflow: { field: 'status', live: 'live', draft: 'entwurf' }` —
  gets them in all of those places.
- The collection serializer moved from `layers/admin/app/utils/collections-serialize.ts` to
  `layers/core/collections-ui/serialize.ts` and is exported through `#kestrel/collections-ui`
  (`serializeCollection`, `serializeCollections`, `SEO_FIELD`, `LAYOUT_FIELD`, `TITLE_FIELD`,
  `STATUS_FIELD`, `BODY_FIELD`, `SLUG_FIELD`, `STATUS_VALUES`), together with its golden fixtures, so the
  admin and the `GET /api/admin/schema` route share one implementation. Consumer-visible only for code
  that imported the admin path directly.

- Admin: "UI kit first" is enforced. The `kestrel/ui-kit-first` lint block makes a raw `table`,
  `button`, `input`, `select`, `textarea` or `dialog` in `layers/admin/app/**/*.vue` an error naming
  the kit component, and closes the ways around it: template `eslint-disable` comments do not apply,
  `role="button"`, `href="#"`, kit classes on foreign elements, mixed-case raw controls, a literal
  `<component :is="'button'">`, a bound `:role="'button'"` and `v-html` are errors, and inline ESLint
  comments in template or script have no effect there; `components/ui/**` is exempt. The 32 existing raw controls in 18 files moved to the kit
  with unchanged classes, ARIA names, keyboard paths and `data-*` hooks.
- Admin styles: `assets/scss/_reset.scss` is wrapped in `@layer reset` and the `body`/`a` defaults of
  `_base.scss` in `@layer base`, so kit `:where()` rules win over both element selectors while call-site
  classes keep winning over everything.
- Admin: `BlockTree.vue` and `field/Repeater.vue` hand their row markup to `BlockTreeRow.vue` and
  `field/RepeaterRow.vue` (typed props and emits); no DOM, class, ARIA or behaviour change.
- `ui/Dialog.vue` teleports overlay and content to the body (`DialogPortal`); the media picker fills the
  viewport with an even margin, capped at 1600px, full screen below 640px, with a scrolling body; nested
  dialogs (upload provenance, new folder, rename, delete) render above it on their own layer.
- The preview toolbar keeps one open button (live preview); the link to the public page sits next to
  the publish status once the page is live.
- The `/api` mount path is a shared constant (`layers/core/mount-path.ts`) used by the Nitro plugin and
  `presetModuleConfig`.
- `no-unsafe-type-assertion` applies wherever the other type-aware rules do (every layer,
  `packages/renderer-nuxt`, `playground`, `.vue` included, tests included); 199 assertions became
  discriminated-union guards (`fieldIs`), `boundaryCast` at real JSON, AST, DOM or host boundaries,
  generic overloads or small literal-union guards; nine directives remain for TypeScript and
  standard-library gaps, each with its reason.
- Admin: every `runAction` call site outside `pages/admin/system.vue` shows the unexpected-error
  toast on `meta.unexpected` (29 sites).
- `layers/core/nuxt.config.ts` enables `typescript.shim`, so `.vue` imports from `.ts` files need no
  component cast; the insights canvas virtual module carries an ambient declaration.
- vitest 4 (root and `packages/renderer-nuxt`; a stale nested vitest 3 had silently dropped the
  three renderer contract tests); jsdom is the DOM environment of the `components` project.
- Module-config lookups (upload limit, inline SVG types, readiness probe, images `publicPath`
  check) resolve the owning module through the booted `kestrel.steps.owner()` instead of calling
  each module's `steps()`; a module can no longer borrow another module's config by accident.
- Type-aware ESLint rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`,
  `no-unsafe-*`, `require-await`, `restrict-template-expressions`,
  `no-unnecessary-type-assertion`) apply to every layer, `packages/renderer-nuxt` and `playground`,
  including `.vue` script blocks; `no-unsafe-type-assertion` is an error in
  `layers/admin/app/actions`. `playground/app/**` is covered by the backend-import ban.
- `featureOrder` derives from `featureFactories`; `StaticPipelineName` derives from
  `staticPipelineNames`.
- The type stubs for the optional `@vue-flow/core` and `@dagrejs/dagre` peers contain no `any`.

### Fixed

- Media viewer: the dialog body now fixes the header and footer and scrolls only the details panel, so
  the image stays in view while editing metadata; a `Delete` action was added that runs through the same
  `MediaDeleteDialog` (reference precheck, recursive-folder handling) as the context menu, closes the
  viewer and refreshes the list on success, and returns focus to the library.
- `KestrelUiDialog`: the fixed-header/scrolling-body/fixed-footer layout used by `size="screen"` now
  applies to every size, capped by each size's own `max-height`, instead of being tied to the `screen`
  variant alone.
- Media library drag-and-drop: hovering an SVG folder icon (e.g. the folder-up icon's stroke) dropped the
  drop-target highlight because the hit test only accepted `HTMLElement`; it now accepts any `Element`.
- Block picker: a single favourite no longer stretches across the full width of the "Large" view (the
  grid used `auto-fit`, collapsing empty tracks; it now uses `auto-fill`, matching the default grid view).
- The consumer's global CSS no longer reaches `/admin` (consumer-visible): the admin styles dropped their
  cascade layers, which lose to every unlayered consumer rule, and bind every rule to the admin roots
  `.admin` and `.admin-portal` instead — design tokens included, so a consumer's `:root` tokens and the
  admin's no longer overwrite each other in either direction. A consumer's `body { font-family; color }`,
  its element selectors and its own reset leave the admin's fonts, colours, headings, links, lists,
  buttons and form controls unchanged; the kit's `:where(…)` variant rules keep losing to call-site
  classes. `BootFailure.vue` and the teleported toast host carry `.admin-portal` so they get the same
  base outside the layout root. Consumers are advised, but not required, to put their own reset in a
  named `@layer`.
- Media upload counter stuck at "0 uploaded": the queue mutated a non-reactive object.
- Redirects could not be saved: `locale` is sent only for collections with a localized field; an
  `additionalProperties` violation gets a plain-language prefix.
- Block picker: favourite and info buttons no longer change background on hover; the block info popover
  renders above the picker in every view.
- Insights tables keep numbers, routes and cron expressions on one line; the steps column wraps.
- `playground/kestrel.config.ts` gave `delivery-static` no `media.publicPath`; the builder sets
  `/api/media` on both modules.
- `sanitizeInBrowser` throws instead of returning the unsanitized input when DOMPurify reports
  the environment as unsupported.
- `collections-serialize.ts`: a `relation` override applies only on top of an existing base
  relation instead of producing an incomplete `{ collection, many }` object.
- Media viewer: a failed metadata request no longer leaves an unhandled rejection; the dialog shows
  a translated inline error.
- Upload limit: a failed `GET /limits` no longer disables the size guard for the session; the
  check is retried and the error shown.
- Logout and session check: a failed `/logout` is logged and toasted; only a 401 from `/me` ends the
  session, any other failure keeps the token and shows a "backend not reachable" notice with a
  retry button on the login page.
- Dashboard tiles show a per-tile load error instead of a silent dash.
- `GET /api/ready` non-200 bodies carry `code` (mirrors `state`).
- Two no-op `boundaryCast` calls removed; `layers/core/types/schemas.d.ts` is an ambient
  declaration again (a trailing `export {}` had turned it into an augmentation that failed
  silently under type-aware linting).
- `docs/architecture.md`: the UI runner is described without the non-existent
  `PipelineFailure`/`PipelineDone` analogy, the actions runner import path and the `cast.ts`
  statement are correct; `docs/consuming-kestrel-web.md` links the backend pipeline docs instead of
  a missing `docs/PIPELINES.md`.
- Insights trigger chips no longer wrap between the HTTP method and the path: `.insights-chip` is
  `white-space: nowrap` and ellipsizes past `16rem` instead, with the full value in `title`; the
  trigger cell wraps between chips like the steps cell already did (shared `.insights-chip-cell`),
  and the same cell class now covers the module table's provides/requires/optional columns.
- Insights graph: the module node's "N errors" is the count of distinct error codes the module's
  steps declare, not runtime errors, so it no longer renders in the danger colour next to the
  neutral step and config counts; the label reads "N error codes" and a tooltip explains the
  source.
