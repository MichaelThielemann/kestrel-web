# Changelog

## Unreleased

### Breaking

- **Events modules are now two modules.** `kestrel-events-inmemory` is the `events@1` bus and nothing
  else; delivering event-trigger pipelines is the job of exactly one delivery module. Add
  `@michaelthielemann/kestrel-events-direct` to your module list directly after
  `@michaelthielemann/kestrel-events-inmemory`. With the `eventsQueue` feature, add
  `@michaelthielemann/kestrel-events-queue` there instead and keep the bus — `events-queue` no longer
  provides `events@1`. `presetModuleConfig()` does all of this for you, and the order inside the list no
  longer matters for events.

  Three behaviour changes: a programmatic `events.on` handler that throws now fails the run that emitted
  the event with 500 `INTERNAL` instead of being logged and ignored; with `events-queue` a programmatic
  bus subscriber no longer sees events emitted by pipeline steps, only events raised through `events@1`
  by a module; and no ordering is guaranteed between the pipelines subscribed to one event.

  **Every event a pipeline receives now carries `eventId`, `event` and `at`**, including events a module
  raises through `events@1` — `migrations.applied` gains those three fields and keeps its own unchanged.
  Use `eventId` as the dedup key. Programmatic bus subscribers still see the raw data.

  The dead-letter list now has one entry per event **and** pipeline, and each entry names its
  `pipeline`. Queue counters grow accordingly. Stored events from a previous major are delivered to
  every pipeline subscribed at the first worker tick after the upgrade; drain the queue first if that is
  not what you want — this matters in particular when several worker processes share one queue, since
  each of them fans out on its own next tick. A dead-letter row written before the upgrade names no
  pipeline; `events.listDead` reports it as `""` and the admin's System → Events tab shows an empty
  Pipeline cell for it.

  If you author your own module (not one of kestrel's) that raises an event through `events@1` from
  inside its own `setup()`, declare that event in the module's `emits`. Without it, `sortModules` has no
  reason to set your module up after the delivery module, and with `events-queue` an event raised before
  the queue exists is lost — there is nobody subscribed yet to store it.

  A `Deps` object built by hand — in a module's own tests, or when embedding the core outside
  `boot()` — now needs an `eventTriggers` property (the configured event triggers, in configuration
  order); `Kestrel["contracts"]` itself is unaffected.

- `DeadEvent` (the dead-letter list item type) gains a required `pipeline` field, naming the pipeline a
  dead-letter row belongs to; a row stored before this change reports `pipeline: ""`.

- **A preset write pipeline now has an atomic group.** `createPage`, `updatePage`, `deletePage` and
  their equivalents for every collection wrap the reference check, the content write, the revision and
  the reference/link index in `{ atomic: [...] }`: either all of them are stored or none is, closing the
  window where a step after a failed write left the database with a stored document but no revision, no
  reference index and no link index. `overrides` takes the same shape (`readonly PresetEntry[]`, a step
  name or `{ atomic: [...] }`, `PresetEntry` exported from `#kestrel/pipelines`) and an override that
  drops the group around the pipeline's `content.*` write, or around `deleteUser`'s `authn.deleteUser`,
  is rejected when the preset composes, naming the pipeline — wrap the write steps in `{ atomic: [...]
  }` or `exclude` the pipeline and define your own. Switching the grouped write to a different
  `content.*` operation on the same collection (for example `content.set` instead of `content.create`)
  still counts as keeping the group. `PresetOptions["overrides"]`, `FeatureModule["pipelines"]` and the
  collection/base pipeline builders change shape accordingly. With the `eventsQueue` feature, a
  pipeline's trailing `events.emit:` step joins the end of its group instead of running after it
  (`deleteUser` gets a group only in this mode, for its `user.deleted` subscribers) — nothing else moves
  into the group, so a step like `revisions.reportRestore` keeps merging its output after
  `delivery.publish`'s; every other single-write pipeline keeps no group in both delivery modes, since
  none has a shipped event subscriber whose loss needs undoing.

  The golden fixtures (`playground.json`, `synthetic.json`, `without-images.json`) reflect the new
  nesting; a fourth fixture, `queued-events.json`, pins the `eventsQueue` variant.

  `layers/admin`'s insights step chips render a pipeline's atomic group as one bracketed, labelled
  (`role="group"`, `aria-label`) unit, and `InsightsModule`/`InsightsPipelineStep`
  (`layers/core/app/types/api.ts`) gain `atomicScope` and `atomic` to carry it.

- **`GET /api/ready` and `GET /api/health` now read the booted instance's `health()`** instead of
  `/api/ready` probing a `count()` call and `/api/health` never failing. `health()` aggregates every
  module's own synchronous, I/O-free `health(instance)` hook (`persistence-sqlite` reports its store
  unusable, with `restartRequired: true`, only after a failed atomic-scope rollback — never lock
  contention), so neither probe can flap under write load the way probing a call's outcome could.
  `/api/ready` answers `503 { ready: false, state: "degraded", error: "<module>: <reason>", code:
  "degraded" }` whenever `health().ok` is false; `/api/health` stays `200` through booting and a
  recoverable boot failure and answers `503 { ok: false, error: "<module>: <reason>", uptimeSeconds }`
  once `health().restartRequired` is true. A restart policy already pointed at `/api/health` now has
  something to act on. `layers/core/server/utils/readiness.ts` exports `readinessFromHealth` and
  `livenessFromHealth` in place of the removed `probePersistence`.

- **Publishing is an event pipeline; the write response no longer wraps the document.**
  `createPage`, `updatePage`, `deletePage`, `deletePageTranslation` and `restorePageRevision` no longer
  contain `delivery.publish:pages`, `delivery.unpublish:pages` or `delivery.exportLlms`. Two new
  pipelines do that work instead — `publishPage` (triggered by `page.created`, `page.updated`,
  `page.restored` and, when the model is translatable, `page.translationRemoved`) and `unpublishPage`
  (triggered by `page.deleted`) — registered by the `delivery` feature alongside its existing
  `pagePublishStatus`/`publishAllPages`. A publishing error therefore no longer fails a save: the
  content, its revision and its indexes are stored, and the request answers 200 regardless of whether
  the page was actually published.

  **The page is still published before the response, in both delivery modes.** Every preset pipeline
  that ends in an `events.emit:` step now additionally runs `events.relay` right after it — not
  necessarily as the pipeline's very last step; `restorePageRevision` still ends `…, revisions.reportRestore`
  after the relay, since that step reads the group's result outside the group — which reports, and with
  `kestrel-events-queue` performs, that run's delivery. The response of a page write is the saved
  document plus `_events: { status, pipelines: [{ event, pipeline, status, attempts, dead, error }] }`
  (both `status` fields `"done" | "error" | "pending" | "queued"`, see below); it used to be
  `{ document, delivery, llms }`. `DELETE` answers
  `{ _events }`. Read the publish status per locale from `GET /admin/publish-status/pages/:id` as
  before — the write response no longer carries it. `SaveResponse<T>` is gone from the exported API
  types; `RevisionRestoreResponse` is the document plus `restore?` and `_events?`.

  **Only publishing keeps its head start with the queue.** `presetModuleConfig()` derives the
  events-queue module's `relayPipelines` as `publishPage`/`unpublishPage` when `delivery` is on, `[]`
  otherwise — the queue's relay claims only those rows, bounded by the new `eventsQueue.relayMs` config key (default
  5000), so a page publish or unpublish still completes before the response goes out. Every other
  event-triggered pipeline — `anonymizeAuditUser` and `reassignRevisionAuthor` on `user.deleted`,
  `auditAuth` on `login`/`logout`, `generateImageVariants` on `uploadMedia` — is left to the worker from
  the moment the request returns; `_events` reports it as `"queued"` instead of `"done"`/`"error"`. Pass
  `overrides` naming the `kestrel-events-queue` module to relay a wider or narrower set, or `"all"` for
  the previous behaviour of every subscriber running inline, bounded by the same budget.

  **A content field name must not start with `_`.** That namespace belongs to the members the system
  merges onto a document — `_locale`, `_links` and `_translations` already, `_delivery` and `_events`
  now. A
  model with such a field fails at boot, naming the type and the field.

  If you deliver a second collection yourself, add the two pipelines and their triggers the same way;
  the preset wires `pages` only, as it always has.

  In the admin: `layers/admin/app/actions/steps/api.ts`'s `isSaveResponse`/`apiWrite` special case is
  gone — `apiWrite` reads the response's `_events` member directly. `deliveryRemember` is replaced by
  `deliveryRefresh` (refetches `/admin/publish-status` after a page save, so the live lamp reads the
  authoritative endpoint in both delivery modes) and `deliveryToast` (a toast when `_events.status` is
  `"error"` or `"pending"`, naming the retry route for the active delivery mode); the delete action
  toasts the same way when unpublishing a deleted page failed. The events tab's dead-letter table gains
  a Run column next to the Pipeline column the previous release added.

- A new base pipeline `eventsDeliveryStatus` answers `GET /admin/events/delivery` (permission
  `system.manage`), the deliveries the active event-delivery module gave up on; it collides with a
  consumer pipeline or route of that name. `InsightsManifest` gains a required `warnings`,
  `UserDeleteResponse` a required `_events`.

- `EventRelayStatus`'s `status` and `pipelines[].status` gain a fourth value, `"queued"`, for a
  subscriber the queue's relay selection leaves to the worker (see relay selection above). An
  exhaustive `switch` over either union needs a case for it.

- `MediaItem` (`layers/core/app/types/api.ts`, generated from the backend's OpenAPI document) gains a
  required `variantCounts: { done, pending, error, failed }`. Code that builds a `MediaItem` by hand
  now needs the field.

- **The admin resolves every route from the booted schema's capabilities instead of a hard-coded path
  or role table.** `GET /api/admin/schema` now names, per collection and by verb, and for every other
  pipeline reachable over HTTP, the `{ method, path }` the caller may use — a pipeline removed by
  `exclude`, dropped from a consumer's trigger list, moved to another path, or gated by an
  `authz.require` permission the caller's role does not have, is left out; the corresponding control is
  hidden instead of failing on click. The schema is caller-specific and must not be cached: the admin
  refetches it on login, on logout, after the signed-in user's own role changes, and on a 403 from any
  kestrel route other than the schema route itself.

  `useAuth()` loses `can`, `isAdmin`, `roles` and the module-level `canWithRoles`; use
  `useCapabilities().has(pipeline)` or `.hasVerb(collection, verb)` instead. `ActionDeps` gains a
  required `capabilities` field (a `CapabilityResolver`); build it with `useActionDeps()` instead of
  constructing `{ api, t, toast }` by hand. `ApiClient`, `ApiCall` and `UploadTransport` now take an
  `ApiRoute` (`{ method, path }`) from `useCapabilities()` instead of a path string; `useApi()` itself
  is unchanged and still takes a path. Admin code calls it only through `useAdminApi()` (routes) or,
  for `useAuth()`/`useSchema()` themselves, directly — the two composables `useAdminApi()`'s own reauth
  interceptor is built from, so they cannot call `useAdminApi()` without a circular import. `mediaFileUrl` moves off `useApi()` onto
  `useCapabilities().mediaFileUrl(id)`, returning `null` when the caller cannot download media (a
  placeholder icon renders in its place). `AdminSchema` gains a top-level `capabilities` map and each
  collection gains its own `capabilities` object; anything constructing an `AdminSchema` by hand (tests,
  fakes) needs both. A preset override of `adminSchemaModel` that drops `authz.describePipelineAccess`
  now fails at boot. The server also refuses to start unless `login`, `logout` and `me` are reachable at
  their fixed routes (`POST /login`, `POST /logout`, `GET /me`; an alias next to the fixed route is
  fine) — the admin calls them before it has read its capabilities. Requires
  `@michaelthielemann/kestrel-authz-roles` with `authz.describePipelineAccess`.

  Visible behaviour: a collection whose list pipeline the caller may not run no longer appears in the
  rail; before, it appeared and failed on open. Every control gated on a verb the schema does not grant
  is hidden the same way — a collection's own update/delete/translation-delete, the bulk bar's
  publish/unpublish/delete, the singleton form's save (the form is read-only without `set`), every media
  write control (upload, new folder, rename, move, delete) and the media viewer's save/delete, and the
  `/admin/media` and `/admin/insights` pages themselves — instead of rendering an enabled control that
  fails on click with a generic error. The images tab now appears with `images.read` instead of
  `images.manage`, with its manage buttons hidden rather than disabled; the redirects tab follows
  `redirects.read` instead of the `admin` role; the users, replication, migrations and events tabs
  follow their own `*.manage` permission instead of the role name `admin`.

  A new `layers/admin/app/**/*.{ts,vue}` lint rule (`kestrel/admin-api-routes`) bans a path literal
  passed to the admin API client, a hand-built `{ method, path }` route object, a raw `/api` URL outside
  `apiUrl()`, and any admin call to `useApi()` outside `useAdminApi()`/`useAuth()`/`useSchema()`; admin
  page routes (`navigateTo`, `NuxtLink`) are unaffected.

- **Breaking (admin client): the reauth interceptor no longer patches the global `$fetch`.**
  `installAdminClient()` used to replace `globalThis.$fetch` with a wrapped instance carrying the 403
  refetch/401 redirect logic; `useAdminApi()` now builds its own `$fetch.create()` with that interceptor
  attached directly, and never touches the global. Consequences: a public-layer or consumer `$fetch`
  call made in the same browser tab after visiting the admin is never intercepted by admin logic — even
  by coincidence, even if it answers 401 or 403; every `useAdminApi()` call carries the interceptor
  regardless of whether `layouts/admin.vue` (and therefore `installAdminClient()`) has run yet, since
  the interceptor no longer depends on install order at all; and a dev server module reload cannot wrap
  the global fetch a second time, since nothing wraps it. `installAdminClient()` now only installs the
  dev style guard. `useApi()` itself reads the plain, unpatched `$fetch` again.

- `referencesPrecheck`'s `allowed`/`target` options are replaced by a single `capability: (ctx) =>
  Capability | undefined`, taken directly from the schema instead of resolved separately; the same
  change applies to `PreviewDeleteInput.allowed` and `PreviewMediaDeleteInput.allowed`, both now
  `capability`. `PrecheckReport` and `BatchDeleteReport` gain a required `verifiable: boolean`, true
  once a reference check was actually attempted (as opposed to skipped because the collection has no
  reference route at all) — anything constructing either type by hand needs it.

- `useSchema()`'s state gains a required `generation: number`, bumped only by `clear()` (logout, login,
  an identity change), used to discard an answer that arrives after a newer `clear()` superseded it;
  `refresh()` no longer clears the schema first — it keeps serving the current one until the new answer
  replaces it in one assignment, so a 403-triggered refresh cannot blank a still-valid schema mid-flight
  or unmount an open editor. `SCHEMA_PATH`, previously an auto-imported global in
  `composables/useSchema.ts`, is gone; `utils/reauth.ts` builds its own local schema-route path from
  `LAYER_ROUTES.schema` instead.

### Added

- `#kestrel/pipelines` exports `relayPipelinesFor(features)` and `RELAY_CANDIDATE_PIPELINES`, the helper
  and the candidate list `presetModuleConfig()` uses to derive the `eventsQueue` module's relay selection;
  call it yourself for a hand-written module list.
- `EventDeliveryStatus` (`layers/core/app/types/api.ts`), the type of `GET /admin/events/delivery`'s
  response.
- `InsightsBootWarning`, and `InsightsManifest.warnings` (see the new base pipeline above).
- `definePreset()` gains an error for a queue relay selection that names a pipeline from the preset's own
  vocabulary (a static, feature or generic-collection pipeline name) that this configuration does not
  currently compose — because its feature is off, its collection is absent, or `exclude`/`overrides`
  dropped it: `preset: module "@michaelthielemann/kestrel-events-queue" is configured to relay pipeline
  "<name>", which the preset does not compose – …`. A name outside that vocabulary passes through; the
  `eventsQueue` module's own boot check still rejects an unknown pipeline once every pipeline is resolved.
- The media library grid shows a progress tile for a file while it uploads (queued, uploading, and while
  the response is outstanding), then the file itself with a small chip noting that its image variants are
  still being generated or that some could not be generated; the chip clears on its own, without a reload,
  once every variant has finished. Table view shows the same upload states (queued, uploading, processing,
  failed) in the existing upload row list, without the chip. Grid thumbnails now load the smallest ready
  image variant instead of always fetching the original. Reads `images.attach`'s `variantCounts` field; the
  admin never checks which delivery mode generated the variants. New reusable `KestrelUiProgress` component
  replaces the upload queue's own progress bar.
- `layers/admin/app/utils/capabilities.ts`: `ApiRoute`, `RouteParams`, `PipelineName`, `fillPath`,
  `routeFrom`, `apiUrl`, `MissingCapabilityError`, `CapabilityResolver`, `capabilityResolver`.
- `composables/useCapabilities.ts`, `useAdminApi.ts`, `useActionDeps.ts`, `useMediaCapabilities.ts`.
- `layers/core/fixed-routes.ts`: `ADMIN_BOOTSTRAP_ROUTES`, `LAYER_ROUTES`.
- `layers/core/pipelines`: `collectionVerbs`, `MULTI_VERBS`, `SINGLE_VERBS` and the `CollectionVerb`,
  `MultiVerb`, `SingleVerb` types, re-exported from `#kestrel/pipelines`.
- `layers/core/app/types/kestrel.ts`: `HttpMethod`, `Capability`, `CollectionCapabilities`,
  `AdminCollection`.
- `useAuth().refreshAccess()`: re-checks the session and refetches the schema; called after the
  signed-in user edits their own roles.
- The `kestrel/admin-api-routes` ESLint rule (see Breaking above).

### Changed

- The dashboard shows how many event deliveries failed for good and links to System → Events: the
  queue's dead letters, or with inline delivery the failed deliveries of the process that served the
  page. `/api/ready` and `/api/health` answer as before.
- System → Events is available with inline delivery too; it shows the failed deliveries of this process,
  since when, and a pointer to Insights → Live.
- The insights page lists the boot warnings of the instance above its tabs, each with every context
  field it carries.
- Deleting a user reports a failed follow-up task (revision reassignment, audit anonymisation) instead
  of a success message, and a still-running one as pending.
- The `eventsQueue` feature now boots with no event trigger in the manifest at all — an idle queue is a
  valid configuration, not an error; `presetModuleConfig()` + `definePreset()` no longer throw for it.
- `create-kestrel`: new projects enable `eventsQueue` by default, so an upload answers as soon as the
  file is stored and its image variants render in the background worker; existing projects keep their
  mode.
- `presetModuleConfig()` no longer sets `persistence-sqlite.acquireTimeoutMs` to a fixed `15000`; left
  unset, the module derives it as `busyTimeoutMs` plus a 10 second margin (`15000` with every default in
  place), so raising `busyTimeoutMs` through `overrides` no longer risks a value at or below the fixed
  `acquireTimeoutMs`, which would have failed to boot.

- `deleteMediaFolder` now calls `media.listFolderItems` instead of the deprecated `media.folderItems`;
  behaviour is unchanged.

- `layers/core/app/types/api.ts`: `MediaItem`, `ReplicationStatus` and `ReplicationSnapshotResult` are
  now plain aliases of the generated OpenAPI response types instead of widening a subset of fields to
  required — the backend now declares those fields required itself, so the widening is redundant. The
  published field optionality is unchanged for `ReplicationStatus` and `ReplicationSnapshotResult`;
  `MediaItem` gains the new required `variantCounts` field described under Breaking.

- `layers/core/app/types/api.ts` no longer imports types from a backend package's `impl` subpath; the
  types it used to take from there (media, images status, delivery status, replication) are now aliases
  of `layers/core/app/types/openapi.generated.ts`, generated from the preset's OpenAPI document with
  `pnpm generate:api-types`. `pnpm test` fails if the generated file is stale. The exported field
  optionality of `ReplicationStatus` and `ReplicationSnapshotResult` is unchanged from the previous
  release; `MediaItem` gains the new required `variantCounts` field described under Breaking.
  `scripts/generate-api-types.ts` now boots the same content model as `playground/`
  instead of a near-duplicate of it, so the collection names behind the generated types (for example
  `pages`, which decides `PublishStatusEntry`) have one source; this drops the script's unused `news`
  scaffold collection and has no effect on any exported type.

### Fixed

- The insights configuration table no longer collapses into a one-character-wide path column with
  overlapping header labels at phone width. It sizes its columns to their content and scrolls
  horizontally instead of shrinking; a long value or default now wraps within a bounded width rather than
  forcing every column to nearly nothing.

- The insights graph and the admin sidebar now work at phone width: the sidebar collapses to icons
  below 640px and expands as a dismissible overlay instead of covering the page, and the interactive
  graph is replaced by a readable list of modules and connections instead of an empty pane.

- The record editor's header action row no longer clips invisibly at narrow or dense widths. It now
  wraps instead of overflowing, and below 640px the less-frequent actions (version history, undo, redo,
  and the publish/unpublish toggle) collapse into an overflow menu; Save, Cancel, Delete and both status
  lamps stay directly visible and operable. The action row moved into a new `RecordHeaderActions`
  component.

- The blocks editor's stacked layout (tree/preview/fields, below 1100px) no longer lets its columns
  grow past the available width: the single grid track is now floored at `0` instead of sizing to its
  widest pane, so the live preview scales down correctly and the page-fields panel — and its inputs —
  stay fully visible instead of running off the right edge with no scrollbar to reach them.

- `/admin` no longer keeps the browser's default 8px body margin. The admin layout marks `<body>` with
  an `admin-body` class only while it is mounted, and the admin stylesheet zeroes the margin under that
  class; the public site is unaffected.

- The block editor's live preview no longer flickers its zoom level when the preview pane's own
  vertical scrollbar toggles on and off. The preview's stage now reserves scrollbar-gutter space
  unconditionally, so the width it measures for the auto-fit zoom calculation stays the same whether
  or not a scrollbar is actually shown, removing the feedback loop between the two.

- `POST /admin/users/:id/revisions/reassign` and the `reassignRevisionAuthor` listener on `user.deleted`
  now verify the reassignment target through `authn-multi` before touching any revision: an id naming no
  user or an inactive user is rejected (404 or 400) instead of being written straight into the author
  field. A caller-supplied `name` is ignored; the canonical username is looked up fresh at the moment of
  reassignment, closing the gap where a target valid at delete time could have been deactivated or
  removed by the time a retry or a queued listener runs.

- `createUser` and `updateUser` now reject an unknown role name in `roles` with 400 `VALIDATION` and
  `details.unknown` before writing anything, instead of silently creating or updating a user with a role
  that grants no permission.

- Deleting a record of a collection with no references route (anything other than pages) no longer
  shows "References could not be verified" on every delete; the precheck now runs only for a collection
  that actually has one, and reports a genuine lookup failure separately from "not applicable here". A
  caller without the reference-check capability on a collection that does have one (for example a role
  missing `pages.manage`) now sees no warning either, since the check cannot run for them — the server's
  own `references.guard:pages` step still refuses the delete regardless of what the dialog showed.

## 2.0.1 – 2026-09-21

### Changed

- Documentation and changelog wording. No behaviour change.
- `create-kestrel` 5.0.1 asks for this release of the layer.

## 2.0.0 – 2026-09-20

### Breaking

- `definePreset` now validates collection names against `^[a-z][a-z0-9_]*$`, the pattern
  `kestrel-content-default` and `kestrel-validate-jsonschema` require, instead of
  `^[a-z][a-zA-Z0-9]*$`. A camelCase name such as `blogPosts` used to pass config-time validation and
  then fail the boot with `content/default: invalid type name "blogPosts"`; it is now rejected where
  it is written, with a message that says why. Rename such a collection to `blog_posts` — the change
  is a rename of the content type, so existing records need a data migration. Underscores, which the
  backend has always accepted, are now accepted here too.

- The preset moves user deactivation from `DELETE /users/:id` to `POST /users/:id/deactivate`, the
  counterpart of `POST /users/:id/activate`, and gives `DELETE /users/:id` the new `deleteUser`
  pipeline, which removes the user for good. A consumer with its own `triggers`, `overrides` or
  `exclude` list that named `deactivateUser` behind `DELETE` keeps its own mapping and has to move it
  itself; a consumer on the preset gets the new routes with the next build. Needs
  `@michaelthielemann/kestrel-authn-multi` 5.5.0 or newer for the `authn.updateUser` and
  `authn.deleteUser` steps.

### Added

- Deleting a user now decides what happens to what they wrote. `DELETE /users/:id` takes an optional
  `{ reassignTo }` — the id of another active user — and answers
  `{ ok: true, reassignTo: { id, name } | null }`; `deleteUser` emits `user.deleted` with
  `?with=result`, so the listeners see the target. The `revisions` feature adds
  `reassignRevisionAuthor` on that event plus `retryReassignRevisionAuthor`
  (`POST /admin/users/:id/revisions/reassign`), the `audit` feature adds `anonymizeAuditUser` plus
  `retryAnonymizeAuditUser` (`POST /admin/users/:id/audit/anonymize`), both behind `users.manage` and
  both idempotent, so a failure seen in Insights → Live can be repeated. Needs
  `@michaelthielemann/kestrel-revisions-default` and `@michaelthielemann/kestrel-audit-persistence`
  5.8.0 or newer.
- The delete dialog in System → Users asks what happens to the author reference: anonymise it (the
  default) or transfer it to another active user, picked from a list that leaves out the account
  being deleted and every inactive one. Content and version history stay either way, which the dialog
  says; an unusable (400) or unknown (404) target is shown as a localized message and the user
  survives it. The history dialog names an anonymised author "Deleted user".
- `presetModuleConfig({ audit: { retentionDays } })` passes the retention to `audit-persistence` and
  is what adds the `pruneAudit` cron (`45 3 * * *`, rescheduled through `schedules`); without it
  there is nothing to prune and the cron stays out.
- Field types of your own, declared once and usable on a collection field *and* on a block prop. An
  optional `shared/field-types.ts` exports `defineFieldTypes({ color: { storage: "text", schema: { … },
  empty: "#2266cc" } })` (from `#kestrel/collections-ui`) as its default export and is reachable as
  `#kestrel/field-types`. Pass it to `presetModuleConfig` and `definePreset` as `fieldTypes`:
  `presetModuleConfig` maps each declared type onto its `kestrel-content-default` storage type before
  the model reaches the content module (an undeclared type name now throws naming
  `collection.field`), `presetSchemas` emits the JSON-schema fragment inline as `"<collection>.<field>"`,
  and the preset inserts `validate.check:<collection>.<field>` before `content.create`/`update`/`set`,
  so an invalid value answers `400 VALIDATION` with `details.fields` and the admin shows it on the
  field. `block-schema.ts` uses the same fragment for `field("color")` props instead of the open `{}`
  default branch. `GET /api/admin/schema` reports the declared type name plus the storage type, the
  admin's component and empty-value registries are reactive, `empty` is registered for you, and a
  field whose type has no component yet renders the storage type's component with a note rather than
  an inert placeholder. `playground/` carries a worked colour field; `docs/field-types.md` is the
  reference.
- The admin's own strings are a consumer extension point: an optional `shared/admin-i18n.ts` exporting
  `defineAdminI18n({ en: { … }, fr: { … } })` as default (`#kestrel-admin/i18n/define`) is merged into
  the shipped catalogs at startup, key by key. A shipped language keeps every key the file does not
  name, any other tag adds a language to the account menu's language switch, and a key it leaves out
  falls back to English at lookup time. A key no catalog defines fails the typecheck, and the dev
  server warns about one that only appears at runtime. `de.ts` is now typed against the keys of `en.ts`,
  so a missing or stray translation fails `pnpm typecheck` and `parity.test.ts` names it. With no
  stored choice the admin starts in the first of `navigator.languages` that has a catalog (`de-AT`
  matches `de`); the cookie still wins once set. The switch shows each language's own name with a
  `lang` attribute. `{count}` interpolation is unchanged and there are still no plural forms.
- New package `create-kestrel` (`packages/create-kestrel`, 5.0.0):
  `pnpm create kestrel my-site` scaffolds a consumer of this layer — locales, features, blobstore and
  a bootstrap admin whose password is stored only as a scrypt hash in `.env`. It has no runtime
  dependencies, runs from `.mjs` without a build, and pins the generated `package.json` to the layer
  and engine versions this repository uses (`packages/create-kestrel/versions.json`, derived by
  `scripts/create-kestrel-versions.mjs` and guarded by a test and by `prepack`). `--yes`, `--name`,
  `--pm`, `--locales`, `--features`, `--blobstore`, `--admin-user` and `--admin-password` (or
  `KESTREL_ADMIN_PASSWORD`) make it non-interactive. The release workflow publishes it alongside the
  layer; it keeps its own version number.
- New feature `revisions` on `@michaelthielemann/kestrel-revisions-default` (`revisions@1`): every save
  of a `multi` collection records a full snapshot with author, locale and status. The preset inserts
  `revisions.record:<c>` directly after `content.create:<c>`/`content.update:<c>` and the matching
  `remove`/`removeTranslation` steps after their content step, adds `<c>Revisions`, `<c>Revision`,
  `label<C>Revision` and `restore<C>Revision` under `/admin/<c>/:id/revisions…` (read needs
  `<c>.manage`, label and restore `<c>.write`), and `pruneRevisions` on cron `15 3 * * *`. The restore
  pipeline is derived from the collection's own `update` pipeline, so a restore is an ordinary save and
  republishes exactly when the restored state is live. `presetModuleConfig` gains a `revisions` option
  (`keep`, `maxSnapshotBytes`, `pruneOnWrite`, `maxLimit`) and a `collectionsUi` option, from which it
  derives the module's `statusField`/`liveStatuses` so "never prune a state that was live" follows a
  custom workflow.
- The record editor gains a version-history button left of Undo (feature on, record saved,
  `<c>.manage`). It opens the page's versions as a git-like tree: `layoutRevisions` turns the parent
  pointers into lanes, branch colours, head and live markers, rendered as a keyboard-operable listbox
  (Arrow/Home/End/Enter, roving tabindex) that names every marker in words as well as colour and
  collapses to indentation at phone width, with paged loading. The details pane shows time, author,
  origin, status, size, a field and block diff against the current editor state, the version name
  editor and "Restore this version" behind a confirmation that warns about unsaved changes. A version
  older than a model change is restored anyway: the fields the model no longer has are named as "left
  out" and the ones it gained since as "not covered", before the restore, in the confirmation and in
  the toast, and a validation failure on the restored body lists the validator's own problems.
- Insights gains a first tab, "Config" (`InsightsConfig.vue`, `?tab=config`): every config variable of
  every module, grouped by module, with path, type, required flag, effective value, default and
  set/default/missing status, a filter over module name, path and visible value, and a link from each
  group heading to the module page. The value comes from `ConfigVariable.value` of
  `@michaelthielemann/kestrel` 5.6.0 or newer; a variable the backend marks `redacted` — or that an
  older backend only marks `secret` — shows a lock icon and the word "redacted" instead of a value, in
  the Value and the Default column, and is left out of the filter. Long values ellipsize with the full
  text in `title` and get a copy button from 24 characters on. `value` and `redacted` are optional in
  `InsightsConfigVariable`, so an older backend renders an em dash instead of failing. Modules without
  a config variable sit behind a collapsed disclosure. The module page's config table
  (`InsightsConfigVariables.vue`) is the same component and therefore gained the Value column too.
  A bare `/admin/insights` lands on the first tab of the strip (`DEFAULT_TAB` is `TAB_IDS[0]`), which
  is now `Config`; `?tab=` deep links are unchanged.
- System → Images lists the variants that gave up (`SystemImagesFailures.vue`): the total plus the most
  recent ones with media item, size, attempts, error and time (relative, absolute in `title`), from
  `readStatus`'s new `failed: { variants, recent }` of `@michaelthielemann/kestrel-images-default` 5.6.0
  or newer. `ImagesStatus.failed` is optional, so an older backend renders the empty state. The
  "Retry failed variants" button confirms, then runs the `imagesRetryFailed` action against
  `POST /admin/images/retry-failed`, toasts how many variants across how many media items were queued
  again, reloads the status and restarts the job polling.
- The preset pipeline `retryFailedImages` (`POST /admin/images/retry-failed`, `authn.requireUser`,
  `authz.require:images.manage`, `images.retryFailed`) in the `images` feature and in
  `staticPipelineNames`. A consumer that wants the images module's new `renderTimeoutMs` sets it through
  `presetModuleConfig`'s `overrides`, which is the only images config surface the preset exposes.
- `KestrelUiTabList` (`components/ui/TabList.vue`): the roving-tabindex `role="tablist"` strip the system
  and insights pages built by hand. It owns the `ui-tabs`/`ui-tabs__item` classes and the active-tab
  styling; both pages now render it instead of hard-coding `ui-btngroup__item` on a `KestrelUiButton`
  without rendering `ButtonGroup`, which also removes the duplicated arrow/Home/End key handling and the
  `data-state="active"` value that never matched the kit's `[data-state='on']` rule.
- Insights → Live shows a "Recent failures" table (`InsightsFailures.vue`) above the pipeline counters:
  time, pipeline, trigger, status, code, step, message and run id of the last failed runs, newest
  first, from `stats().recentFailures` of `@michaelthielemann/kestrel-insights` 5.5.0 or newer. The
  message wraps, every other long value ellipsizes with the full text in `title`, and an empty state
  covers both "nothing failed yet" and a backend that answers without the field —
  `InsightsStats.recentFailures` is optional in `#kestrel-admin/types/api`.
- The preset pipelines `updateUser` (`PATCH /users/:id`, `authn.requireUser`,
  `authz.require:users.manage`, `authn.updateUser`, `events.emit:user.updated`) and `deleteUser`
  (`DELETE /users/:id`, the same guard, `authn.deleteUser`, `events.emit:user.deleted`), both in
  `staticPipelineNames`. `authn-multi` guards the last active holder of `users.manage` itself
  (409 `LAST_ADMIN`) once an `authz@1` module is configured, which `presetModuleConfig` always does.
- Admin, System → Users: the row cogwheel gives way to an actions menu (`KestrelUiActionMenu`) with
  Edit, Activate/Deactivate and Delete. `UserEditDialog.vue` renames a user, sets their roles
  (a checkbox group over every role in use, extendable with a free role name), switches the account
  active and optionally sets a new password with confirmation — each part only sends its own request
  when it changed. `UserDeleteDialog.vue` is the delete confirmation. Both refuse the signed-in
  user's own account up front, and the backend's `LAST_ADMIN`, `CONFLICT` and self-protection
  answers appear as localized messages (`utils/user-errors.ts`).

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

- The admin string `users.deleted` is gone; the delete toast now names the outcome through
  `users.deletedAnonymized` or `users.deletedReassigned`. A consumer overriding the old key through
  `shared/admin-i18n.ts` has to move the override.

- The page builder's left pane reads top to bottom as page entry, the "Block structure" label, then the
  blocks, and the keyboard walks it in that order. The label's icon shares the column of the drag
  handles and the page entry's icon, and all three labels share one text inset, so nothing in the pane
  hangs out to the left any more.

- Admin CSS isolation, verified on the packed layer (`pnpm pack` installed into a consumer app, every
  admin view diffed against the playground in both themes for ~90 computed properties per element):
  - `_base.scss` pins the whole inherited set on the admin root, not just font and colour — weight,
    style, variant, letter and word spacing, text align/indent/transform/shadow, white space, word break,
    hyphens, tab size, list style, cursor, caret colour, accent colour, visibility — so a consumer's
    `body` rule no longer reaches in. `_reset.scss` re-inherits the same set for unclassed elements.
  - `_reset.scss` gains blanket `inherit` rules at (0,1,0) for `letter-spacing` (excluding the six kit
    classes that set tracking on purpose) and for `caret-color`, `word-spacing`, `text-indent`,
    `text-shadow`, `hyphens`, `font-variant` and `visibility`, which beat a consumer's element selectors
    on classed admin elements too.
  - the admin declares its own `::selection`, `::placeholder` and `::marker`, resets `outline-offset` and
    `text-decoration-thickness`, and resets `content` on `::before`/`::after` for unclassed elements.
  - `:root[data-theme=light|dark]` carries `scroll-behavior: auto` next to `color-scheme`, so a
    consumer's `html { scroll-behavior: smooth }` no longer applies on admin routes.
  - the theme is set on the `.admin` element as well as on `:root` and the token blocks match both, so a
    consumer's `useHead` cannot strip the admin palette by clobbering the root attribute.
  - `layers/admin/nuxt.config.ts` registers the kit with `priority: 10`: an app component named
    `KestrelUiButton.vue` no longer replaces the kit's button (which previously removed the login form's
    submit control entirely).
  - `scripts/isolation-diff.mjs` is the repeatable proof: it drives the playground and a consumer app
    with playwright-core and diffs every admin view in both themes, per element and per property (see
    `docs/architecture.md#admin-css-isolation`).
  - `scope.test.ts` grew guards for all of it — the pinned inherited set, the pseudo-element scoping, the
    document-root allow list, and a scan that fails when a kit component declares one of the
    blanket-inherit properties.

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

- Insights and System could not be scrolled once a tab's content was taller than the viewport: the
  scroll container class of the full-height panes was declared inside `CollectionList.vue`'s component
  stylesheet, which the bundler only loads together with that component. Every other view — all six
  Insights tabs, the module detail page, the System tabs — applied the class without the rule, so the
  container stayed `overflow: visible` and the pane's `overflow: hidden` cut the content off. The rule
  moved to `assets/scss/_base.scss` as the `u-scroll` utility next to `u-stack`/`u-measure`, and
  `scope.test.ts` now fails on a `u-*` class a template uses that the global stylesheet does not
  declare, or on a `u-*` rule declared inside a component.
- The version-history tree gave two different side branches the same number and colour whenever the
  second one reused a freed lane. `layoutRevisions` now numbers branches, not lanes: a new number is
  handed out when a row claims a free lane, it travels with the chain, and the colour follows the
  branch, so lane reuse stays invisible in the names and colours. `merges` and `through` carry
  `{ lane, colour }` instead of a bare lane index.
- The merge arms of the history tree approached a node from above and ended behind it. They now run
  down their lane, turn once and arrive horizontally at the node's vertical centre.
- The selected row of the version history drew its accent as an inset box shadow of another width than
  the selected block row's border. Both now use the shared `selected-accent` mixin — same token, width,
  squared leading corners and background.
- Saving an unchanged record did nothing but write a new revision. Save is disabled and every submit
  path is a no-op while a stored record is unchanged, for collection records and singletons, with
  `title`/`aria-describedby` "No changes to save". A record that does not exist yet and a locale whose
  translation is still missing stay saveable; publishing and unpublishing are unaffected.
- `UserEditDialog.vue`: the "Add role" button sat in a row next to the whole role-name field, so the
  field's label pushed it below the input it belongs to. It now sits inside the field's control row
  and is centred against the input.

- Everything the kit teleports — dialogs, dropdown and context menus, the account menu, popovers,
  tooltips, combobox lists, the date pickers and the toasts — landed directly on `<body>`, outside
  `.admin`, and therefore outside the scoped stylesheet: unstyled text, no tokens, no theme, no
  z-index tiers. The admin layout now renders `KestrelUiPortalHost`, one
  `<div id="kestrel-admin-portal" class="admin-portal" :data-theme>` teleported to the body, and every
  reka portal targets it through `useAdminPortal()` (`:to="portalTarget"`, `:portal="{ to: portalTarget }"`
  for the pickers that portal internally). The density tokens that `.admin` declared inline moved to
  `_tokens.scss` so both roots share them. `components/portal-target.test.ts` fails when a kit component
  renders a reka `*Portal` without the shared target or teleports straight to the body, and
  `components/ui/PortalHost.dom.test.ts` asserts that a dialog's overlay and content, an open dropdown
  menu and the toast region all sit inside the portal root.
- Insights tables: `.insights-chip-cell` set `display: flex` on `<td>`, which took the cell out of the
  table layout — rules ran through cells, chips dropped onto their own lines and the remaining columns
  shifted (Requires showed the step count, Optional the config summary). The chips now wrap in an inner
  `.insights-chips`, the cell stays a table cell with exactly one bottom rule per row, and
  `.insights-table` centres short and numeric cells vertically against multi-line chip cells. Applies to
  Modules, Pipelines, Triggers, Live, the recent-failures table, the config variables and the module
  detail page.
- Media viewer: the details panel scrolls only vertically — it is wider (22rem), clips horizontally and
  its children may shrink — and the dialog title ellipsizes instead of pushing the close button out.
- The media toolbar's search field kept its class on the `<input>` (`inheritAttrs: false`) instead of the
  flex item, so the scoped width rule never matched and the field spanned the whole row. It now sits in
  its own container, and the upload status ("Uploading… n uploaded", "Generating variants…") moved from
  the bottom of the library to that row, right-aligned, as one `aria-live="polite"` region.
- `scripts/isolation-diff.mjs` opens overlays (account menu, user row menu, new-user dialog, media
  upload dialog) as extra views and reports any UI element under `<body>` that is outside `.admin` and
  `.admin-portal`, which is what missed the teleported overlays before.
- Admin isolation residue: the `sr-only` mixin pins its own text metrics and colour, the hidden file
  input is declared outside `:where()` so a consumer's class rule cannot reveal it, and the password
  reveal button and `option` elements declare their padding so a consumer's `* { padding: 0 }` cannot
  change it.

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
- Dark and light theme meet WCAG 2.2 AA (consumer-visible): `--color-primary-text` is the new accent
  colour for text and links (the fill `--color-primary` stays), the dark primary fill is a touch darker
  so a white label clears 4.5:1 on it and on hover, the light neutrals (`--color-text-muted`,
  `--color-text-subtle`, `--color-control-border`), `--color-danger` and `--color-success` were darkened
  to clear their thresholds against the page, and the dark `--color-border` was raised to stay visible.
  `--color-focus-on-fill` gives the focus ring of a filled primary or danger button its own colour — it
  was drawn in the button's own colour before. New tokens `--color-overlay`, `--color-on-overlay`,
  `--color-overlay-edge`, `--color-canvas` and `--color-on-canvas` replace the last hard-coded colours
  in `layers/admin` (`field/Media.vue`'s overlay buttons, `BlockPreview.vue`'s preview surface,
  `SeoFields.vue`'s and `field/Slug.vue`'s literal fallbacks). `scripts/token-contrast.ts` measures
  every token pair in both themes and runs as a test.
- The site description reaches the public page (consumer-visible): the `description` field of the
  `settings` singleton is part of `SettingsDocument` and `SiteSettings` again, and `[...slug].vue` and
  the preview page render `<meta name="description">` and `og:description` from the page's SEO
  description with the site description of the current locale as the fallback. A blank value counts as
  unset, so an empty page and an empty site description render no meta tag. The admin shows the
  inherited site description as the placeholder of the SEO description field and in its SERP preview.
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
