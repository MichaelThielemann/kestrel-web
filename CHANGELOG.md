# Changelog

## Unreleased

### Added

- The upgrade plugin answers kestrel's `ops` hook (plugin API 6). `kestrel update prepare` and `kestrel update
  bundle` read from it the readiness route `/api/ready`; the environment of a local start of a copy: on
  `127.0.0.1`, on the filesystem store, with `NODE_ENV=production`, storage migrations checked, content migrations
  applied, `KESTREL_ROBOTS_POLICY=disallow` and the public development stand-ins for the admin password hash and
  the second-factor key; `llms.txt` as the file every render of the export writes, for a project whose `features`
  in `shared/model.ts` or `kestrel.config.ts` spell out `delivery`, and no export check for one without; the
  variables whose values are secrets (`KESTREL_ADMIN_PASSWORD_HASH`, `KESTREL_MFA_KEY`, `KESTREL_DEVICE_KEY`, `KESTREL_S3_ACCESS_KEY_ID`,
  `KESTREL_S3_SECRET_ACCESS_KEY`); and the migration switches `KESTREL_STORAGE_MIGRATIONS` (storage) and, only for
  a project whose `kestrel.config.ts` reads it, `KESTREL_MIGRATIONS` (content): the preset passes no content
  migrations mode of its own, so in a project that does not wire the variable, such as one from the starter
  template, pending content migrations run at every start. The hook also answers the blob store and the database file a deployed
  environment's variables select (`KESTREL_BLOBSTORE`, `KESTREL_S3_*`, `KESTREL_BLOBS_DIR`, `KESTREL_DATABASE_FILE`,
  `KESTREL_DATA_DIR`, `KESTREL_APP_ROOT`), read from the map it is given, never from `process.env`, with relative
  paths resolved against the project root. `kestrel status`, `backup` and `restore` take the storage, prefixes and
  target of an environment from `kestrel.environments.json`, not from the hook. For a project whose `features`
  include `migrations`, the hook lists the ids of the migration files (`migrations/*.ts`, or the directory
  `kestrel.migrationsDir` of `nuxt.config.ts` names) as the release's content migrations, which an update plans
  and rehearses on a copy of the database; a migration whose `id` is not a string literal in its default export
  is refused with the file's name. The `kestrel` field of `package.json` declares `pluginApi: 6`.
- `KESTREL_DATABASE_FILE` names the SQLite file `presetModuleConfig()` opens for persistence-sqlite and
  replication-sqlite in place of `kestrel.db` in the data directory, and `KESTREL_BLOBS_DIR` the root of the
  filesystem blob store `envBlobstore()` builds in place of `<dataDir>/blobs`; relative values resolve against the
  process cwd, empty ones are ignored. A local start of a copy that runs content migrations for `kestrel update`
  opens the database copy and blob directory the tooling prepares through
  `update.localBoot.env`: `{ "KESTREL_DATABASE_FILE": "{database}", "KESTREL_BLOBS_DIR": "{blobs}", "PORT": "{port}", "NITRO_PORT": "{port}", "NUXT_APP_BUILD_ID": "{build}" }`.
  `NUXT_APP_BUILD_ID` gives that start a build id of its own, so the production start of the release sees a new
  build and renders every page again from the migrated content.
- `KESTREL_STORAGE_MIGRATIONS` sets `storageMigrations` of media-default and images-default in
  `presetModuleConfig()`: `check` (unset or empty, in production and outside it) refuses to start on media or
  image data in an older storage shape and names the migration, `apply` runs the migrations that write no blobs
  at start-up. Any other value stops the config from loading. `KESTREL_MIGRATIONS` does not change it. A module
  entry in `overrides` wins over the variable. `envStorageMigrations()` in `#kestrel/config` reads it.
- `#kestrel/config`: `envBlobstore(dataDir, env)`, `requiredEnv(name, env)`, `kestrelDataDir(env, base)` and
  `envStorageMigrations(env)` read a given environment map instead of `process.env` (the default), and
  `kestrelDataDir` resolves `KESTREL_APP_ROOT` and its fallback against `base` (default the process cwd). The
  map's type is exported as `EnvMap`.
- After a database restore that replication-sqlite or backup-blobstore reports, the first start whose
  `deliveryBuildCheck` handles it runs `syncPublicMedia` (`media.syncPublic`, with `images` also
  `images.syncPublic`) before the instance answers ready, so the public copies of the media originals and image
  variants match the restored rows. A later start whose check succeeds and which `delivery.checkBuild` tells no
  new restore does not run it. A check that fails before `delivery.checkBuild` stored the restore leaves it to
  the next start, which handles the same restore again. A check that fails at a later step, such as
  `delivery.requestIndexes`, cannot tell whether it stored a restore, so it runs the sync whether a restore was
  reported or not, at every start that fails this way, and logs `delivery: the index files could not be exported
  at start`. A failed sync is logged and does not stop the start; the nightly `syncPublicMedia`
  repeats it.
- `envStepLog()` in `#kestrel/config` reads `KESTREL_STEP_LOG` (`all`, `errors` or `off`; unset or empty means `all`,
  any other value throws) for defineConfig's `stepLog` option. `all` writes a log line for every step, `errors` for
  every step whose result is not ok, `off` for none. The playground passes it as `stepLog: envStepLog()`.
- `app/image-sizes.ts` takes an optional `label` per size, a `Localized` that says what the size is used for.
  The labels are a new export of `#kestrel/blocks`, `imageSizeLabels`; `imageSizes`, `#kestrel/image-sizes` and
  `.nuxt/kestrel/image-sizes.json` keep their entries as they are. When two layers label a size differently the
  first label is used and the build warns. A `label` on a size in `defineBlock({ imageSizes })` fails the build.
- Admin: each tile of the crop editor names below its ratio what the sizes of that ratio are used for, the labels
  of the blocks that declare them and the labels of `app/image-sizes.ts`, else the size names ("Hero, Teaser
  card" under "3:2"); the title of the chosen tile names them too ("Ratio 3:2 (Hero, Teaser card)"). The tile
  column scrolls on its own and keeps the chosen tile in view, and becomes a horizontally scrolling strip below
  48rem.
- Admin: the crop frame snaps while dragging, pinching and zooming with the wheel. Within 8 screen pixels the
  middle of the image snaps to the middle of the frame, and the centre of the focus to the middle and the thirds
  of the frame, with the guide highlighted; an axis that leaves the crop at most two pixels of room does not snap. Alt held during the gesture places the crop freely; the arrow keys,
  the slider and the number fields stay exact. A "Snap to guides" switch in the head of the crop detail turns it
  off, remembered per browser.
- Admin kit: `KestrelUiSwitch` (an on/off switch, `role="switch"`, bound to a boolean) and `KestrelUiCropGuides`;
  `KestrelUiCropFrame` takes `snap` (default `true`). The `move` and `pinch` handlers of `usePointerDrag()`
  receive the pointer event as their last argument.
- Images can carry a focus and a manual crop per aspect ratio (kestrel's images-default "Focus and crop"). With
  `images`, the preset composes `setMediaFraming` behind `PUT /media/:id/framing` (`media.write`): it stores the
  framing, renders the `cover` variants whose cut changed within the request and answers the item like
  `getMedia`, ending with the same `authz.fields:media?shape=item` cut, with or without `eventsQueue`. The admin schema lists it as a capability. The preset refuses an
  override that drops `images.generate` after `images.setFraming`, and one that emits `images.planned` from any
  pipeline but `planImageVariants`.
- With `images`, the derived anonymous `media` grant carries `focus`, `variants[].crop`, `framing.width` and
  `framing.height` (the original's dimensions after its orientation), and `toPublicMedia()` keeps them (`focus`
  is `null` for an answer without one; `crop` and `framing` are left out when the answer has none). `MediaItem` gains `focus` and `framing`, and `MediaVariant` gains `crop`, the part of the oriented
  original its bytes show, or `null` for the whole image or the centred cut of its ratio; in
  `PublicMediaVariant` it is optional. `MediaRect`, `MediaFraming` and `MediaFramingRatio` are exported from the
  API types. `kestrel upgrade check` reports a narrowed `roles.anonymousFields.media` that keeps the variants but
  not `focus`, the item's `width` and `height`, `framing.width` and `framing.height`, or every variant member
  `KestrelImage` reads (`size`, `path`, `width`, `height`, `crop`), and names the fields to add (`preset/media-focus-grant`).
- `KestrelImage` sets `object-position` from the centre of the item's `focus` on the original and on a variant
  of every size, so the original that stands in for a variant while it renders keeps the focus in view;
  `focusObjectPosition()` answers that value. `pickImageSources` passes a variant path with its `?v=` query
  through unchanged, in `src` and `srcset`, and builds a `srcset` from the variants with the reference's aspect
  ratio and an equal `crop`, so a `cover` variant whose cut stays centred keeps the `inside` widths of its ratio
  and one cut differently gets a `srcset` of its own. The original as the reference takes `framing.width` and
  `framing.height` as its box; without them the item's `width` and `height`, turned when the uncut variants of the
  declared `inside` sizes show the swapped aspect, and the declared `cover` sizes stay out when none tells the
  orientation of an original that is not nearly square. It takes the declared sizes as a fourth argument, by default the build's
  (`#kestrel/image-sizes`), and groups by their `cover` ratio keys when the variants carry no `crop`. A width
  tie keeps the named variant (`cut` in its answer says whether `src` links a declared `cover` size).
  `KestrelImage` and `pickImageSources` take an item without `focus` (`ImageMedia`).
- Admin kit: `KestrelUiSlider` (a labelled range input), `KestrelUiRectSelect` (draw, move and resize a
  rectangle on an image, or set a point) and `KestrelUiCropFrame` (a frame in an aspect ratio over an image that
  pans and zooms, showing the cut images-default renders). Both work with the pointer, touch and the keyboard
  alone and take their values as numbers too; `KestrelUiCropFrame` applies a typed number on Enter or when the
  field is left. `usePointerDrag()` takes a `threshold` in pixels. The admin may import
  `@michaelthielemann/kestrel-images-default/framing`; `kestrel/no-backend-in-ui-layers` keeps refusing the
  package's other entry points.
- Admin: a crop editor for images. The media viewer offers "Adjust crop" for an image to a role that may write
  media and run `setMediaFraming`, and a media field offers it as an icon button on each chosen image that is in
  the library, not in the trash. The editor marks the focus with a live preview per ratio of the `cover` sizes,
  and adjusts the crop of each ratio, manual or automatic, with a reset to automatic, a warning when the focus
  does not fit and a note when a crop is smaller than a size kestrel renders, whose variant is then delivered
  smaller. An original browsers cannot display, or a WebP original whose orientation tag browsers ignore, is
  shown from its largest finished variant without a `crop` that has the oriented original's aspect, and is not
  offered for editing before that variant is finished; the media viewer and a media field show the button once
  the item's variants have all finished rendering. Without a `cover` size it edits the focus only and says why.
  It names how many records use the image, asks before Escape or Cancel drops unsaved changes and saves through
  `PUT /media/:id/framing`.
- Static delivery keeps `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt` current. Every pipeline that
  changes what they list asks for an export instead of writing it in the request: `publishPage`,
  `unpublishPage` and the publish pipelines of every mounted collection, `settingsDependents`, `publishAllPages`
  and each `publishAll<Name>`, `retryStalePages`, `deliveryBuildCheck` (so every start exports them once) and,
  with `migrations`, `rebuildPathsAfterMigrations`, which also marks every delivered page for a re-render. With
  `eventsQueue`, `refreshIndexes` (`delivery.exportIndexes` on `delivery.indexesStale`) runs in a lane of its own,
  `indexes`, and `refreshLlms` runs `delivery.exportLlmsFull`; the queue holds them back 1000 ms and 3000 ms
  (`delaysFor(features)`), so one export follows a burst of saves and llms-full.txt trails the re-renders it
  reads. Without the queue, delivery-static's loop exports the index files one second after the first request
  (`dependencies.indexesDelayMs: 1000`). Neither delay is an option of `presetModuleConfig()`, and the preset
  refuses a `delayMs` or `indexesDelayMs` that holds another value, from `overrides` or a hand-written entry
  (`preset/index-export-delays`), and names every index export a `delayMs` leaves out; a `delayMs` that also
  holds back pipelines of the site's own spreads them in: `{ ...delaysFor(features), digest: 60000 }`. A
  hand-written queue entry without `delayMs` gets a warning from `kestrel upgrade check`. The Node server does
  not serve the four files; behind a proxy to it, serve them from the export's `site/` prefix at the
  host's root (`docs/deployment.md` §7, "Index files").
- With `delivery`, `presetModuleConfig()` passes `NUXT_PUBLIC_SITE_URL`, normalised the way
  `@michaelthielemann/kestrel-delivery-static/site-url` does it, to delivery-static as its top-level `siteUrl`;
  the variable is the one source of the site URL for the index files and the pages alike. It takes `sitemap`
  and `robots` (`{ policy?: "allow" | "disallow", extra?: string[] }` or `false`) as well. With `delivery` and
  no site URL it warns once.
- `deliveryBuildCheck` runs the `checkRestored` step of replication-sqlite (or else backup-blobstore) when that
  module restores persistence-sqlite's database file, directly before `delivery.checkBuild`, so a restored
  database re-renders every page even with an unchanged build.
- The server passes `<buildId>|<siteUrl>` to `deliveryBuildCheck`, with the normalised `public.siteUrl` the
  pages are rendered with, so a changed `NUXT_PUBLIC_SITE_URL` re-renders every page and its absolute URLs. It
  warns at start when delivery-static's `siteUrl` (a hand-written entry, or an override) differs from it.
- Every site page's canonical link and `og:url` (see Breaking) are built with `normalizeSiteUrl` and
  `pageUrl` from `@michaelthielemann/kestrel-delivery-static/site-url` exactly like the sitemap's `<loc>` (the
  home page ends in `/`, every other page has no trailing slash, a base path is kept); `og:site_name` is the
  site settings title. `og:image` uses the normalised site URL too.
  `canonicalUrl()` and `absoluteUrl()` live in `layers/core/app/utils/canonical.ts`; the UI layers may import
  that delivery-static subpath, which imports nothing.
- System → Delivery lists the last export of `sitemap.xml`, `robots.txt` and `llms.txt` (naming only the files the
  site writes) and, while delivery-static's `llms.full` is on, the last export of `llms-full.txt`: when, with how
  many entries, or when and with which error it failed, or that it was skipped because published pages had no
  rendered output yet. After Publish all or Retry the panel keeps loading until both exports show their new
  outcome, for at most a minute. Once a backlog drains it keeps loading until the llms-full.txt export that
  follows the re-renders is shown, for at most a minute from the drain, or, without `llms.full`, for a few
  seconds until the index export a last re-render that moved a page asks for. It reads out to screen readers
  the first outcome of each export after Publish all, Retry or a drained backlog that failed or was skipped,
  even when it repeats the error shown before, and any later one only when the export starts to fail or to be
  skipped or fails with another error.
  `GET /api/admin/schema` carries `llmsFull: true` while `llms.full` is on, `robots: true`
  unless `robots` is `false`, and `sitemap: true` while a sitemap is written (a site URL, `sitemap` not `false`).
- `KESTREL_ROBOTS_POLICY` (`allow` or `disallow`) sets the `robots.txt` policy when `presetModuleConfig()`'s
  `robots` option has none; unset, the production-build default applies. Any other value stops the config from
  loading, even when `robots.policy` or `robots: false` decides; a valid value they override is ignored with a
  warning at boot. `envRobots()` in `#kestrel/config` reads the variable as a `robots` option. create-kestrel's
  `kestrel.config.ts` passes `robots: envRobots()`, its `.env.example` lists the variable and its README
  describes `NUXT_PUBLIC_SITE_URL` and `KESTREL_ROBOTS_POLICY`.

- Media library and picker: visible multi-selection. Every grid tile has a checkbox beside it and the table a
  checkbox column with a header checkbox for the page; while anything is selected, a selection bar takes the
  toolbar's place with the count, "Select all n on this page", "Move to trash" ("Delete" without the trash;
  only for roles that may delete) and "Clear selection"; the bar lies over the toolbar, so the listing keeps its place. The listing is one tab
  stop: arrow keys move through it (up and down by the tile on screen, past upload tiles), Shift+arrow
  selects from the anchor to the focus, Space toggles, Ctrl/Cmd+A selects the page, Escape clears it (in
  the picker, a second Escape closes the dialog), Delete and Backspace delete the selection while focus is on
  an entry that can be selected or its checkbox (the focused item only while nothing is selected); in the
  bar, Ctrl/Cmd+A, Escape and Delete work too.
  Switching between the library and the trash view keeps focus: on the trash heading, or on the library on
  the way back. A status region that stays mounted announces the count and a cleared
  selection. Search, sorting, paging and refreshes keep the visible part of the selection instead of
  clearing it; in a multi-pick, clearing drops only the listed picks, and the bar counts them as "selected
  here". Focus moves to the next item after a removal and to the restored item after an undo, also when it
  had fallen to the picker's dialog or left with a toast. A selected table row shows its tint and edge on
  every cell, the sticky checkbox cell included.
- Media trash in the admin: deleting in the media library or the picker moves the items to the trash with an
  "Undo" toast (8 seconds, held while hovered or focused; only for roles with `media.write`), which brings
  back only what the move put in the trash; in the picker the undo shows inside the dialog instead, where
  focus and screen readers reach it, and when a move ends in a dialog that lists items left behind, that
  dialog carries the undo and the toast follows once it closes. The toast's live region says that an undo
  is available. An empty folder is named as deleted, not as moved. An item already gone counts as removed and is
  never listed as kept. When a run ends in an open dialog, focus moves to its "Undo" or "Close" and the
  outcome is announced. "Use selected" waits while a removal runs, and the media field refuses a pick that
  is no longer in the library. The viewer's delete button says "Move to trash" while the trash is on. A dialog comes
  first only when a page uses one of the files, a file inside a selected folder included, or when the use
  could not be checked; it names the pages per file. "Trash (n)" beside the folder path opens the trash view
  (`/admin/media?trash=1`): restore, delete permanently and empty, with each item's folder and the date it is
  deleted for good, or "In use – stays" for an item a page still uses; files still in use are kept and named
  by file name, also when they are off the page shown. Removal runs in requests of at most 200 ids and
  reports every item that was not removed, which stays selected; "Stop" ends the run after the request under
  way, in the trash and in the final delete without it, and is offered only while another request is left
  to send. A single pick gives each file a "…" menu with its
  delete entry. A media field names an item that lies in the trash and says so, also right after it was
  trashed from its own picker. With the trash on, the admin offers the delete to roles that may reach
  `trashMedia` (and `trashMediaFolder` for folders) and never falls back to the final delete for a role that
  may not; `GET /api/admin/schema` carries `mediaTrash: true` while the trash pipelines are composed.
- Admin kit: `KestrelUiBulkBar`, the toolbar the collection list and the media library share for a selection
  (its count is plain text; announce it through a status region that stays mounted, such as the new
  `KestrelUiLiveStatus`); toasts take an optional action (`push(type, message, { timeout, action: { label,
  run } })`), pause while hovered or focused, and hand focus back to where it came from when their action
  or close button dismisses them; `KestrelUiDialog` re-emits `openAutoFocus` and
  `escapeKeyDown`, wraps a long title, and stays open when a toast is pressed; `KestrelUiCheckbox` takes
  `standalone` for a 24 × 24 px click target.
- Media trash: the preset composes `trashMedia` (`POST /api/media/trash`), `trashMediaFolder`
  (`POST /api/media/trash/folders/*path`), `restoreMedia` (`POST /api/media/trash/restore`), `listMediaTrash`
  (`GET /api/media/trash`), `purgeMedia` (`POST /api/media/trash/purge`), `emptyMediaTrash`
  (`POST /api/media/trash/empty`) and the nightly `purgeExpiredMedia` (cron `0 4 * * *`). Moving to the trash
  and deleting for good need `media.delete`, listing and restoring need `media.write`. With `images`, a
  trashed item's variants are hidden until it is restored; with `references`, a purge leaves referenced items
  in the trash and reports them as skipped; with `delivery`, `media.trashed` and `media.restored` re-render
  the pages that show the item. `presetModuleConfig()` takes `media.trashRetentionDays` (default 30; `0`
  composes none of these pipelines). `DELETE /api/media/:id` and `DELETE /api/media/folders/*path` stay final
  deletes.
- Request log: the API handler and the `/media/…` handler pass the process logger to kestrel, so every
  request kestrel answers writes one `http` JSON line (`runId`, `requestId`, method, path, pipeline, status,
  time, client address), and a request refused before its pipeline ran (no route, a body too large or not
  readable, an unsupported content type) writes one with its `reason`. `docs/deployment.md` §11 describes
  the line, how to find the one behind an error in the admin, and an nginx `log_format` that records the
  same request id next to `$upstream_status`, the answer's `X-Kestrel-Run-Id`, `$upstream_header_time` and
  `$request_time`.
- Admin: every API request and every upload carries a fresh `X-Request-Id`. The message of every failed
  request names the HTTP status and that id as the error id (`… (HTTP 409 · error ID 3f9a2c7b1e04)`):
  error toasts, the inline errors of forms and dialogs (save, rename, users, media details, folders,
  versions, maintenance tasks, the sign-in form), the load errors of lists, the media library, the page
  tree, the dashboard and the System tabs, a failed upload's row and tile, and the media trash: a move to
  the trash, a restore, a delete for good, an empty, the reference check before a removal and the trash
  view's load. A failed upload and an item a removal dialog lists as failed offer to copy the id, and a toast that names an id stays until it is dismissed. A request no server answered, or
  one answered by a page a proxy or gateway wrote in its place, keeps what failed and adds "The request did
  not reach the server or was refused in front of it (HTTP 502 · error ID …)" instead of the proxy's page or
  a bare "Request failed"; after a timeout or a 504 it says that the server may still have processed the
  request, and after a 408 that the server or a proxy in front of it stopped waiting for the request body.
  An answer counts as the server's when it carries `X-Kestrel-Run-Id`, or when its body is a kestrel error
  (string `error` and `code`) or a Nitro or h3 error (number `statusCode` with `error: true`, or with a
  string `statusMessage` and no `error`), for uploads as for every other request; any other JSON body, such
  as a gateway's `{ statusCode, message }`, counts as written in front of the server, and so does a 2xx
  answer that is not JSON or arrived after a redirect, such as an auth proxy's sign-in page: an API request
  fails with the note instead of taking the page as its result, as an upload already did
  (`refuseAnswerFromFront()`, the `onResponse` interceptor of both admin clients). A host server error
  carries no message of its own, so the admin shows its translated text with the status and the id instead
  of the fetch library's `[METHOD] "url": status` line. Every message names what failed in the admin's
  language and puts the server's detail after it without kestrel's module prefix ("Changing the password
  failed — current password is wrong (HTTP 400 · error ID …)" instead of "authn/multi: current password is
  wrong"); a failed delete or status change in a list names the document it failed for. Save errors in the
  editor name the status and the id also for a refused validation, a taken path, a body too large and an
  unsupported content type. A status the admin translates (no role, wrong password, the own account, a
  vanished user) is read as kestrel's verdict only when kestrel or the host server answered. `ApiError`
  carries `requestId` and `reached`; `failureText()` composes such a message, `answeredMessage(t, err,
  lead)` puts the translated lead in front of the server's detail, `serverDetail()` drops the module prefix,
  and `apiErrorText(t, e, lead)` gives the text an inline error display shows.
- Page builder: a block instance can carry an optional alias, set in its fields panel. The preset derives a
  `blockAliases` field, and its editor-owned grant, automatically for every collection whose editor is
  `"blocks"` and which has a `body` field; a consumer never declares it. The field itself is not localized
  (a localized field's name would otherwise still show up in `_locales`' per-field origin map for anonymous
  callers); instead it holds one alias map per locale (`{ [locale]: { [blockId]: alias } }`), since block ids
  differ per locale body, and the editor merges only the current locale's map into it on save, leaving every
  other locale's aliases untouched. It is editor-only by the same field grants that already keep other fields
  from anonymous callers, so it never reaches an anonymous visitor on any pipeline that answers a page, in the
  public site's SSR data or in the static export, and never on the block itself. The block picker's search
  also matches an existing block's alias and jumps straight to it instead of adding a new block.
- Media picker: reopening it starts in the folder the user last browsed, remembered per browser via
  `localStorage`; a field that already holds an item keeps opening in that item's folder every time, and
  only an empty field falls back to the remembered one.
- Media library and picker: a type filter (Images / Videos / Other files), matched server-side against
  each item's canonical content type (requires `@michaelthielemann/kestrel-media-default` with the `type`
  query on `media.list`), narrows the listing with correct paging and combines with the text search; a
  field whose `accept` is fixed to images only offers that one option.
- The `audit` feature records account changes through the new `auditUsers` pipeline (`user.created`,
  `user.updated`, `user.deactivated`, `user.activated`, `user.passwordSet`, `user.passwordChanged`; the
  last three are new events of `activateUser`, `setPassword` and `changePassword`), and every entry now
  carries the client address. `audit-persistence` adds failed sign-ins and password checks, 403 and 429
  answers on its own. create-kestrel selects `audit` by default and keeps entries for 90 days
  (`audit: { retentionDays: 90 }`).
- The `ratelimit` feature limits failed sign-ins per account as well as all sign-ins per address
  (`loginAccount`, keyed by the field `session.identifier` names, cleared by a successful sign-in, with a
  growing block capped at `maxBlockSeconds`), counts an IPv6 address by its /64, and limits failed password
  checks in `changePassword` and `confirmPassword` per signed-in user (`passwordCheck`). `presetModuleConfig()`'s
  `ratelimit` option takes `loginAccount` and `passwordCheck` next to `login`. A hand-written
  `kestrel-ratelimit-memory` entry without them boots with their defaults, and `kestrel upgrade`'s
  `preset/ratelimit-buckets` writes them into it. create-kestrel selects `ratelimit` by default.
- Known devices: after a successful sign-in the `ratelimit` feature hands the browser a signed device cookie
  (`__Host-kestrel_device`, `HttpOnly`, `Secure`, `SameSite=Strict`, 30 days, bound to the exact name of the account that signed in). Sign-ins
  carrying it count against that device's own budget (`ratelimit.knownDevice`, default 10 failures per 5
  minutes, blocked up to 15 minutes) instead of `loginAccount`, so someone who blocks an account with wrong
  passwords, or with wrong codes after a leaked password, no longer locks its owner out on a browser that
  signed in before. `presetModuleConfig()`'s `ratelimit` option takes `knownDevice` and
  `deviceCookies: { secretKey?, previousSecretKeys?, maxAgeSeconds? }`, the keys defaulting to `deviceKeys()`
  from `#kestrel/config`: `KESTREL_DEVICE_KEY` when set, else the `mfa` feature's keys (the module derives a
  key of its own from them), else a random key per process. `login` gains
  `ratelimit.rememberDevice:loginAccount` before `events.emit:auth.loggedIn`. create-kestrel writes a fresh
  `KESTREL_DEVICE_KEY` to `.env` with the `ratelimit` feature.
- Feature `mfa`: a second sign-in factor through the new `@michaelthielemann/kestrel-mfa-totp` module. Every
  account sets up an authenticator app at its next sign-in (QR code or key, then a code; ten recovery codes shown
  once) and enters a code at each sign-in after that. `presetModuleConfig()` takes
  `mfa: { secretKey?, previousSecretKeys?, issuer?, enforce? }`, the key defaulting to `mfaKey()` from `#kestrel/config`, which reads
  `KESTREL_MFA_KEY`. New routes `POST /login/second-factor`, `GET /users/second-factor` and
  `DELETE /users/:id/second-factor`; the user list shows who
  has a factor, and an administrator resets one (which ends that account's sessions, emits
  `user.secondFactorReset`, is audited and shows a one-time enrollment code that the owner enters before
  setting up the new factor). create-kestrel offers `mfa` (not preselected) and writes a fresh
  `KESTREL_MFA_KEY` to `.env`. The feature needs `ratelimit` (create-kestrel adds it). The layer depends on
  `@michaelthielemann/kestrel-mfa-totp` and `uqr` (pinned to 0.1.3).
- The record pickers (the internal link picker, including the one in the richtext toolbar, and the relation
  field) show the status name of a record that is not live, such as "Draft" or "Finished", as a small muted
  badge behind its label, in the options and next to the chosen record. A record without a status counts as a
  draft. The name is the status field's own choice label in the admin language; the search still matches the
  label only, and collections without a workflow show nothing. A screen reader hears the option as "Label,
  Status". `FieldOption` gains the optional `hint`, which `KestrelUiCombobox` renders the same way.
- `KestrelUiBadge`, a small label for the admin kit with a `muted` variant for a state next to a name and a
  `counter` variant for a number.
- With `eventsQueue`, the System link in the admin rail shows a counter badge with the number of dead-letter events
  (`events.readDeliveryStatus`, `scope: "store"`), so a background job that gave up shows without opening System →
  Events. It refreshes every 30 seconds while the tab is visible and right after a retry in System → Events, and is
  hidden at 0, without the delivery status capability and for the process-only count of the default inline
  delivery. The link's accessible name carries the count (`nav.systemDead`); the catalogues gain that key.
- `KestrelImage` takes an optional `art` list of `{ media, size, sizes? }` entries for art direction, such as a
  landscape cut on wide screens and a portrait cut on narrow ones. It renders a `<picture>` with one `<source media>`
  per entry, each with the `srcset`, `width` and `height` of its own size, so a `srcset` never mixes aspect ratios;
  `size` stays the fallback `<img>`. `class` and the other attributes go to the `<img>`, and so do the scope
  attributes of the parent and of every ancestor whose root the image is, so `<style scoped>` rules of the
  component that uses it keep applying. A rule in the page head holds the box at the aspect ratio of the selected
  source, so a variant that is still being rendered does not change it; it also sets `display: block`, so the
  `<picture>` is as high as the image, and has no specificity, so your own `aspect-ratio` or `display` wins.
  Without a list the component renders a single `<img>` as before. `pickArtSources()` (returning `ArtSource`
  entries), `artBoxCss()` and the `ImageArtEntry` type are exported for components that build their own markup.
  The docs gain a section on planning image sizes, with the number of variants and the storage they cost, and
  describe that registering a changed set of sizes starts the sync job by itself.
- Admin: System → Replication shows a hint next to "Restore to time" for callers who may restore. On a host with
  an ephemeral disk, such as a container platform, a restore staged from the admin is lost when the instance is
  replaced; the hint names `kestrel restore` as the way to restore there. The text is static and the staging
  mechanism is unchanged. New admin messages `replication.restoreHint` and `replication.restoreHintCommand`.
- When another process already holds the database, the boot-failure banner names that process:
  for `instance-locked` it prints `another process is running on this database: host "<host>", pid <pid>` and
  how to run several processes on one database on purpose (`allowConcurrentProcesses: true`), instead of the
  hint to fix `kestrel.config.ts`. A lock file the module could not read gets a general hint without host and
  PID. A lock that could not be taken because another process is changing it or holds its takeover marker asks
  to retry (naming the process when it is known) and offers no opt-out. A lock from another PID namespace on the
  same host, such as one left by a container restarted on the same volume, cannot be checked for a living process:
  the hint says to stop that process if it still runs, or to delete the lock file or wait for the takeover time if
  nothing uses the database. In `nuxt dev` the hint also says that a restart can overlap the process it replaces
  and to restart once more. Every lock hint names the restart, because `nuxt dev`
  keeps the failed boot until it is restarted.
  A production server still exits with code 1 after the banner; `nuxt dev` keeps running and answers 503.
  An instance whose lock was taken over by another process reports `degraded` on `/api/ready` and 503 on
  `/api/health`, naming the module.
- Media upload panel. In the media library and in the media picker, uploads show in a panel below the
  listing. Its header counts the files ("3 of 5 uploaded, 1 failed, 1 skipped"), shows an overall bar and
  offers "Retry failed uploads". One button reads "Cancel" while files wait or run and "Close" once the
  run is over. A finished run reads "Done" with a check when every file sent was uploaded, and "Finished"
  with a failure icon otherwise; the panel never closes by itself. Each file has a row with a preview or
  type icon, its size and its state: waiting, uploading with a percentage, processing, done, failed with
  the reason and a retry button, cancelled, or skipped with the reason. A row shows a thin bar only while
  its file uploads or is processed. The grid tiles of the open folder show the same states. The upload
  dialog marks a file over the upload limit as skipped, "Too large (size, limit)", before anything is
  sent, and its description and its button count only the files that will be sent. Adding files to an idle
  panel drops the finished files of the last run and keeps the failed ones that can still be retried.
- `useMediaUpload()` gains `retry(id)`, `retryFailed()`, `cancel()`, `canRetry(item)`, `clearFinished()`
  and a `summary` of counts and bytes, and its `onSettled` receives `{ stopped }`. `cancel()` drops the
  waiting files and aborts the running request; a file whose body is already sent finishes processing.
- Admin UI kit: `Progress` takes `size` (`sm`, `md`) and `tone` (`default`, `success`, `danger`). The new
  `Spinner` is the busy ring that `Button` shows while loading; it stands still under
  `prefers-reduced-motion`. The new `ProgressRow` is one row of a progress list: a leading slot, a title,
  meta text, a thin bar, the status as icon and text, a message line and an actions slot. In a narrow row
  the title wraps; in a wide row a title cut off with an ellipsis takes keyboard focus to show its full
  text in a tooltip. The icon set gains `circle-check`, `circle-x` and `rotate-ccw`.
- `presetModuleConfig()` now puts every value it derives into each module entry's `defaults`
  (`{ from: "preset", values }`) instead of `config`, and only the consumer's own `overrides` into
  `config`. `/admin/insights` shows a preset-derived value as "Default · Preset" (blue) instead of
  "set"; a value the consumer sets directly, or an override of a preset value, still shows "set"
  (green). Secrets redact the same way in both layers. `overrides` keeps its 2.x replace semantics: a
  top-level key it names replaces the preset's whole value at that path, including a nested object or
  record (an override that drops a derived role or lane, say), and setting a key to `undefined` resets
  it to the module's own schema default instead of the preset's — none of this changes the effective
  config of an instance with no `overrides`.
- Automatic redirects and re-renders on every public path change: `site.pathsMoved` feeds
  `pathsMovedRedirects` (feature `redirects`: `redirects.recordMoves`, `redirects.export`) and
  `pathsMovedDelivery` (feature `delivery`: `delivery.markMoved`). New pipelines and routes:
  `previewPagePath` (`POST /admin/pages/path-preview`), `rebuildPaths` (`POST /admin/paths/rebuild`,
  `system.manage`), the `resumePaths` cron (every minute), `listAutoRedirects`
  (`GET /admin/redirects/auto`), `removeAutoRedirect` (`DELETE /admin/redirects/auto/*path`) and, with the
  `migrations` feature, `rebuildPathsAfterMigrations` on `migrations.applied`. The collection verb
  `previewPath` names a routed collection's preview pipeline.
- Admin: the slug field previews the page's full public path and names a page that already holds it, a
  path conflict lands on the field that caused it, the pages list shows each page's path, the redirects
  screen lists the automatic redirects with a remove action, and System → Paths rebuilds the path index
  and reports its conflicts.
- The public language switcher links each locale through the page's `_paths`, without a request per
  locale; the untranslated-page redirect uses the default locale's `_paths` entry.
- Subpages ([`docs/paths.md`](docs/paths.md#subpages)): a `pages` collection with `parent: { type: "ref",
  to: "pages" }` routes its pages through `site-default`'s `parentField`, so a page's path starts with its
  parent's. New pipeline `pageTree` (`GET /admin/pages/tree`, `pages.manage`) and collection verb `tree`;
  the parent field is never granted to anonymous callers. The playground, the `create-kestrel` template and
  the preset's default collections give pages a parent field. The admin shows pages as an ARIA tree next to
  the flat list, and the parent picker leaves out the page and its subpages.
- Every mounted collection gets its own publish-all, `publishAll<Name>` on `POST /admin/publish-all/<c>`
  (collection verb `publishAll`). The admin's "Re-render all pages and collections" runs `publishAllPages` and
  each of them and reports the combined count.
- Admin: the pages tree is a treegrid with each page's live state, path and the list's edit and delete
  actions; the mount picker leaves out the home page and names the `maxCascade` limit (reported in the
  admin schema as `maxCascade`); removing an automatic redirect asks first; a path conflict names the
  holder's title only to callers who can read its collection. The editor preview renders a mounted
  collection's document with its own component.
- `kestrel upgrade`: `model/parent-offer` asks whether pages should get a parent field, and
  `model/page-like-mount` offers `mount: true` (with the anonymous `<collection>.read`) for a 2.x collection
  carrying `slug`, `status` and `body`, which is no longer exported otherwise; `preset/site-model-options` passes
  `homeSlug` and `prefixPrimary` from `shared/model` to `presetModuleConfig()` and `homeSlug` to `definePreset()`.
- Mounted collections ([`docs/paths.md`](docs/paths.md#mounted-collections)): `mount: true` on a multi
  collection gives it public paths under the page `settings.mounts` assigns to it, or at the top level. The
  preset composes `resolve<Name>` (`GET /routes/<c>/*path`), `preview<Name>Path`, per-collection delivery
  (`publish<Name>`, `unpublish<Name>`, `<name>PublishStatus`), referrers and the reference and link index,
  adds the reserved `settings.mounts` field with `site.indexMounts` in `setSettings`, and runs
  `site.route:pages` in `resolvePage`. The admin's settings assign each mounted collection to a page; the
  public layer follows the route hint and renders the document with the page template or a global
  component named after the collection. The playground mounts a `blog`.
- `kestrel upgrade`: `preset/override-path-steps` (fix) and `consumer/slug-url` (info). The path event
  pipelines count as safe to deliver twice for `offer/event-queue`.

- `docs/deployment.md` and `docs/consuming-kestrel-web.md` §8/§9 document how redirects are served on a
  static host: the `examples/nginx-njs` edge handler as the default, a generated nginx `map` and HTML
  stubs as fallbacks without njs, and their tradeoffs.
- System › Static delivery shows how many pages wait to be re-rendered, how many failed and how many were
  rendered before changes were tracked, with the progress of "Re-render all pages" and "Retry failed
  re-renders". The page editor shows when a page waits for or failed its re-render; the dashboard warns about
  failed re-renders. New pipelines: `pageDependents`, `settingsDependents`, `mediaDependents`, one
  `<name>Dependents` per collection, `republishOutput` and `refreshLlms` (with `eventsQueue`),
  `resumeStalePages` (every five minutes, a recovery net), `deliveryBuildCheck` (run at start),
  `retryStalePages` (`POST /admin/publish-stale/pages/retry`) and `pagesStaleStatus`
  (`GET /admin/publish-status/pages`).
- `#kestrel/pipelines` exports `lanesFor(features)`, the queue lanes `presetModuleConfig()` sets.
- `StaleStatus` and `RetryStaleReport` (`layers/core/app/types/api.ts`); `PublishStatusEntry` carries
  `stale`, `staleSince`, `staleFailed`, `staleError` and `dependencies`.

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
- `isStaticDelivery()` (auto-imported from `layers/core/app/utils/static-delivery.ts`): whether the page in
  this browser tab was exported for a static host. For event handlers and `onMounted` only; markup must not
  depend on it.
- `sitePath()` and `toPublicMedia()`/`PublicMediaItem` (`layers/public/app/utils/`), and the
  `@michaelthielemann/kestrel-renderer-nuxt/static-marker` subpath with the attribute names
  (`DELIVERY_ATTRIBUTE`, `STATIC_DELIVERY`, `BUILD_ATTRIBUTE`), which UI code may import.
- The layer's upgrade rules for `kestrel upgrade` (`@michaelthielemann/kestrel-cli`): `check`, `fix` and
  `data` list and, where mechanical, fix the layer-specific breaks of the 6.0.0 major (module lists, preset
  overrides, the underscore-field rename, the event-queue offer) next to kestrel's own rules. See
  `docs/consuming-kestrel-web.md` §11.
- `kestrel check`, `kestrel explain <pipeline>` and `kestrel manifest` load a project built on the layer
  through the layer's own loader: its aliases, `nuxt prepare` in a scratch copy, the bundled schemas. `check`
  also reports what the layer's server refuses to start with beyond kestrel's own boot checks: a preset
  composition problem, `site-default` disagreeing with `shared/model`, the admin's login, logout and me
  routes bound elsewhere, a public read that does not filter on the declared workflow, media routes this
  server cannot answer, and the fix for a field grant no pipeline cuts. See
  `docs/consuming-kestrel-web.md` §7.
- `scripts/host-binary` (`kestrel upgrade`) rewrites `kestrel-web-upgrade` in `package.json` scripts to
  `kestrel upgrade`, also behind `pnpm`, `pnpm exec`, `yarn`, `cross-env` or `VAR=` prefixes, and drops a
  runner that could fetch an unrelated registry package of that name (`npx`/`pnpx` and `npm exec`/`npm x`
  without `--no`, `pnpm dlx`, `yarn dlx`, `bunx`, with any flags; a `-p`/`--package` form is reported
  without an edit), reporting that as an error; it warns with file and line about the name in
  Dockerfiles, shell scripts, CI files and the project's other command files, and reports a fetching runner
  there and in Markdown as an error.
- A scaffolded project's README names the `kestrel` command through the chosen package manager
  (`pnpm exec kestrel`, `npm exec --no -- kestrel`, `yarn kestrel`, `bun run kestrel`), never through `npx`.
- `#kestrel/pipelines` exports `checkPreset(options)`, which composes a preset like `definePreset()` but
  collects every problem instead of throwing at the first.
- `kestrel upgrade` also checks the consumer's own `app/` code against the static-export contract
  (§8): the old, unscoped `"site:settings"` key, a fetch key built from `useId()` or watching `useSiteLocale()`,
  an `isr`/`cache`/`swr` route rule on a page route, and a read of a media item's private fields
  (`folder`, `createdAt`, `updatedAt`, `variantCounts`, a variant's `state`); and notes that the first start
  of the upgraded build re-renders every published page in the background.
- `kestrel upgrade` carries a project to background re-rendering: it gives `kestrel-delivery-static` the
  `dependencies` of the event delivery (on a hand-written entry, or through `presetModuleConfig({ overrides
  })`) and a hand-written `kestrel-events-queue` entry its `lanes`, forward-ports a 2.x `setSettings` or
  `set<Name>` override with its group, emit and relay, gives a switch to the queue its lanes, queue
  renders and each forward-ported emit inside the write's group, lists in the docs what stays manual, and notes a `setSettings` override exporting `llms.txt`, own triggers on media events (which can
  carry `id: null` and `ids`), code reading `_llms` or the old Publish all counts, and server caches near
  `/api` reads.
- `GET /admin/events/status`'s response gains `lanes`: per configured named lane, `pending`, `running` and
  `oldestPendingAt`, alongside the existing per-state totals.
- `anonymousFieldGrants(model, features, anonymous, changes?)` and `fieldCutSteps(collections)` in
  `#kestrel/pipelines`: the grants `presetModuleConfig()` derives and the `authz.fields` step that ends each
  public read. The type `PresetPipelineChanges<C>` holds the `exclude` and `overrides` both preset
  functions take.
  `toPublicPage()` and `toPublicSiteResponse()` in the public layer.
- `kestrel upgrade`:
  - `pipelines/public-override-field-step` notes an override of a public read without its field step, worded
    by whether anonymous callers reach it, or with a field step for another resource.
  - `preset/field-grants` prints the grants `presetModuleConfig()` would derive for a hand-written
    `authz-roles` entry, or, once, the grants a project's visitors keep. Before boot it reports a derived
    grant no pipeline cuts and an own public pipeline whose resource no grant names.
  - Override edits also find overrides in a pipeline changes object a `definePreset()` call spreads.
  - `site/private-fields` also reports a page's timestamps read off `useSitePage()`, a `site:` data key or a
    value typed `PageDocument`.
  - `site/media-url-from-id` reports a hand-built media URL (`` `/api/media/${id}/file` ``, `"/api/media/" +
    id`), in a script or a `<template>` binding alike: production has no `/api` route, so the file 404s once
    the page is exported. Read the item's own public `path` instead.
  - `site/media-paths` runs the publicPath/publicCopy/reservedPaths part of the layer's own boot-time media
    check against the configured module list, so a config `check` accepted but the real boot refuses (a
    `publicPath: "/api/media"` suggestion, say) is now caught before it boots.
  - The plugin now implements `idempotentPipelines`/`mediaWiring`: `offer/event-queue` skips its
    `idempotent:<pipeline>` question for every event pipeline this preset's own modules already guarantee
    safe to run twice (the dependents pipelines, `publishPage`/`unpublishPage`, `generateImageVariants`,
    `republishOutput`, `refreshLlms`, `auditAuth`, `anonymizeAuditUser`), and `modules/delivery-media` gets
    this layer's exact wiring (`publicPath: "/media"`, `publicCopy: { prefix: "site/" }`,
    `reservedPaths: ["/api", "/admin", "/media"]`) instead of a generic guess.
- Admin: the redirects editor words a rejected rule in the admin language instead of the server's English text.
  The reason of the answer (`details.reason` with `row`, `field` and `path`, which a current `redirects-default` sends)
  selects a text of `redirects.reason.*` in the English and German catalogs. It stands under the field of the
  row, in the save-failed banner as "Row 2: …" and in the toast, with the reserved prefix or the target of an
  automatic redirect filled in; a rejected list as a whole is named in the banner. An unknown reason, a reason
  that does not belong to its field, an answer without a reason and every other error keep the server's text.
  `ApiErrorDetails` has the optional members `row`, `field`, `reason` and `path`, and `api.ts` exports
  `RedirectRuleReason`.

### Upgrading

- With `images`, `MediaItem` has the members `focus` and `framing`, each `MediaVariant` has `crop`, and
  `PublicMediaItem` has `focus`, all required: a literal of these types (a test mock, a fixture) needs them to
  pass `nuxt typecheck`.
  `KestrelImage`'s `media` prop and `pickImageSources` accept an item without `focus`.
- An image whose variants were rendered before the upgrade has no oriented dimensions in `framing` until
  kestrel plans it again (a size of it added, its spec or format changed) or a framing is saved for it. The
  crop editor measures such an original in the browser when browsers display its type; a WebP, TIFF or HEIC
  original uploaded earlier gets no "Adjust crop" until then.
- `llms.siteUrl` of `presetModuleConfig()` is gone: set `NUXT_PUBLIC_SITE_URL` to its value wherever the server
  runs. The old key fails with a message naming the variable; `kestrel upgrade fix --write` removes it
  (`preset/llms-site-url`, which runs while the project does not load yet) and the finding names the value. A hand-written `kestrel-events-queue` entry needs `indexes: ["refreshIndexes"]` in
  its `lanes` (the preset refuses it otherwise, `preset/index-exports-lane`) and gets
  `delayMs: { refreshIndexes: 1000, refreshLlms: 3000 }`; `kestrel upgrade fix --write` adds both
  (`preset/queue-lanes`). `delayMs` naming a preset pipeline that is not composed is refused
  (`preset/delay-pipeline-unknown`), and so is one that holds `refreshIndexes` or `refreshLlms` for another
  time, or leaves one of them out (`preset/index-export-delays`). `delivery.exportLlms` is not a step any more: an override of `setSettings`
  that keeps its emit loses it (`preset/settings-llms`), and an override or own pipeline whose event reaches
  `publishPage` drops it with the inline publish (`preset/override-delivery`, `preset/own-pipeline-delivery`).

- With `presetModuleConfig()` the media trash is on (`media.trashRetentionDays` defaults to 30). A delete in the
  admin then no longer calls `DELETE /api/media/:id` or `DELETE /api/media/folders/*path`: it runs `trashMedia`
  or `trashMediaFolder` and raises `media.trashed`, and `media.deleted` follows only when the item is deleted
  for good from the trash (Delete permanently, Empty trash, or the nightly `purgeExpiredMedia` at least
  `trashRetentionDays` later), never while a page still uses it. A trigger of your own on `media.deleted`, for
  example one that clears a CDN or a mirror, also needs one on `media.trashed` (and on `media.restored` to
  undo its work); an override of `deleteMedia` or `deleteMediaFolder` does not run for deletes in the admin, so
  move its steps into the trash and purge pipelines, or set `media.trashRetentionDays: 0`. An `exclude` of
  `deleteMedia` or `deleteMediaFolder` does not turn the trash off: `trashMedia`, `purgeMedia`,
  `emptyMediaTrash` and the nightly `purgeExpiredMedia` still move and delete media, so exclude them as well or
  set `media.trashRetentionDays: 0`. Restore or empty the trash before setting `0`: items left in it cannot be
  listed, restored or purged while the trash is off. `kestrel upgrade check` reports all three as
  `runtime/media-trash-deletes`.
- Admin strings: `media.selected`, `media.deleteSummary`, `media.file`, `media.files`, `media.folder` and
  `media.folders` are gone. Their texts live in `media.selection.*` (the selection count), `media.remove.*`
  (the removal dialog's titles, counts such as `media.remove.files`/`filesPlural`/`folders`/`foldersPlural`,
  and buttons) and `media.trash.*`; an override of the old keys in `shared/admin-i18n.ts` has to move to the
  new ones, or `pnpm typecheck` fails on the unknown key.
- Known devices need no new setting with the `mfa` feature: the device cookies are signed with a key derived
  from `KESTREL_MFA_KEY` and follow its rotation. Without `mfa`, set `KESTREL_DEVICE_KEY` (64 hex digits,
  `openssl rand -hex 32`) in production; without it the layer signs with a random key per process and warns
  once, so sign-ins still work but every restart, and every other instance, forgets the known devices until
  their next successful sign-in. A hand-written `kestrel-ratelimit-memory` entry boots with the known-device
  budget added to its `loginAccount` bucket, with `field` set to the login's `identifier` where it is missing,
  and with `deviceCookies` from `deviceKeys()`; `preset/ratelimit-buckets` writes `knownDevices` along with a
  missing `loginAccount`. `kestrel upgrade check` reports a project that would sign with a random key as
  `ops/device-key`.
- A hand-written module list passes `collectionsUi` (the default export of `shared/collections-ui`) to
  `presetSchemas()` as well as to `definePreset()`. Without it on `presetSchemas()`, a field the collection UI
  shows as a link has no schema and the boot fails with `no schema configured for "<collection>.<field>"`;
  without it on `definePreset()`, the server refuses to start because that field is written unchecked.
  `kestrel upgrade check` reports both as `preset/schemas-collections-ui`, and `fix --write` passes
  `collectionsUi` to both calls in `kestrel.config.ts`, importing it when needed.

### Breaking

- zod 4: `@michaelthielemann/kestrel-renderer-nuxt` depends on `zod` ^4.6.6 (was ^3.23.8) and builds its
  `configSchema` with zod 4, as Kestrel 6 requires of every module. A module of your own in
  `kestrel.modules.ts` needs `zod` ^4.6.6 as well, so one copy resolves; a `configSchema` with a node built by
  zod 3 or by a zod release older than 4.6.6 fails boot with `invalid-config-schema` and the path of the node.
  `kestrel upgrade fix --write` raises the range (`deps/zod-range`, in every `package.json` of the project,
  also where zod serves only app code; a project without modules of its own can keep zod 3 there) and rewrites
  the zod 3 forms it knows (`zod/record-key`, `zod/object-default`, `zod/describe-order`); Kestrel's CHANGELOG
  and its upgrade guide ("zod 4 schemas") list the rest. renderer/nuxt needs Kestrel 6: it imports
  `@michaelthielemann/kestrel-contracts/helpers/renderer`, which Kestrel 5's contracts do not ship, and fails to
  load against Kestrel 5. With Kestrel 6, renderer/nuxt's config keeps
  its JSON Schema, variables and default (`assets: true`); a config it refuses reports zod 4's texts
  (`Unrecognized key: "extra"`, `Invalid input: expected boolean, received string`).
- Static delivery writes `robots.txt` (and `sitemap.xml` with a site URL) under its prefix, next to the pages.
  Without `robots.policy`, `presetModuleConfig()` passes the policy `KESTREL_ROBOTS_POLICY` names, and without
  that `allow` in a production build and `disallow` under `nuxt dev`, and warns once. A production build is one
  whatever `NODE_ENV` the started process has: `nuxt build` fixes it inside the server bundle, so
  `node .output/server/index.mjs` without it allows crawlers. A staging server that runs a production build needs
  `disallow` (`KESTREL_ROBOTS_POLICY=disallow`) and a host that serves the exported `site/robots.txt` at its
  root (`docs/deployment.md` §7, "Index files"): the Node server never serves that file, and answers
  `/robots.txt` from `public/` or else with 404, which crawlers take as allowing everything. Behind a plain
  proxy to the Node server, a `public/robots.txt` of your own is the one crawlers get, so keep it until the
  host serves the exported file. Where the host does, a `robots.txt` of your own, served from `public/` or by
  the web server, competes with the exported one, and the first start overwrites a `robots.txt` or `sitemap.xml` it finds
  under the prefix: set `robots: false` (and `sitemap: false` for a sitemap of your own) before that start to
  keep yours. Once overwritten, `robots: false` leaves the exported `<prefix>robots.txt` in place; delete it by
  hand.
- Every site page sets `<link rel="canonical">` and `og:url` (with a site URL) and `og:site_name`, each with
  `tagPriority: "high"`. They replace tags of the same key from `app.vue`, a layout, a block or `app.head`, such
  as a canonical link of your own. To keep yours, give it the critical priority:
  `useHead({ link: [{ rel: "canonical", href, tagPriority: "critical" }] })`.
- On a database from 2.x, the first runs of `resumeStalePages` (cron `*/5`, once `deliveryBuildCheck` ran)
  remove once every page file (`index.<ext>`) under `site/` at a path no page owns, logging each file: the
  files an older version left behind after a failed render followed by a slug change, but also pages placed
  there by hand, such as an uploaded microsite or an older export. Paths under delivery-static's
  `reservedPaths` stay; the preset reserves `/api`, `/admin` and `/media`, and an override of `reservedPaths`
  replaces those three, so list them with your own:
  `overrides: { "@michaelthielemann/kestrel-delivery-static": { reservedPaths: ["/api", "/admin", "/media", "/microsite"] } }`.
- With `prefixPrimary = true` in `shared/model`, static delivery exports every default-locale page under its
  prefix (`/de/about`, the home page at `/de`), where its canonical link, `og:url` and `_paths` point, and the
  public reads resolve internal links in that form: `presetModuleConfig()` passes `prefixPrimary` to
  delivery-static, and `definePreset()` adds `prefixPrimary=true` to the `site.resolveLinks` rules when
  site-default has it. Nothing is exported at `/` any more: the first render of each page after the switch
  writes it under the prefix and removes the files at its old path, the root page `site/index.html` among
  them. A static host needs redirects from `/` to the default locale's home page and from the old unprefixed
  paths to the prefixed ones. An override of a public read (`resolvePage`,
  `getSettings`, `resolve<Name>`) keeps the `site.resolveLinks` rules it names: add `&prefixPrimary=true` to
  them, or its pages and navigation keep linking to unprefixed paths, which the export no longer writes. The
  server refuses to boot when a hand-written delivery-static entry's `prefixPrimary` differs from
  `shared/model`'s.
- `presetModuleConfig({ llms: { siteUrl } })` throws: the site URL comes only from `NUXT_PUBLIC_SITE_URL`.
  With `delivery`, `NUXT_PUBLIC_SITE_URL` must be an absolute `http` or `https` URL without credentials, a
  query or a fragment, or the config does not load (`presetModuleConfig: NUXT_PUBLIC_SITE_URL "…" is not a
  site URL`); a preview-link URL such as `https://user:pass@staging.example.org` that 2.x accepted stops the
  server. Without `delivery` the variable is not checked. `delivery.exportLlms` is no longer a step and stops the boot as an unknown step;
  a hand-written `kestrel-events-queue` entry without the `indexes` lane is refused
  (`preset/index-exports-lane`). "Upgrading" above lists the upgrade rules that fix each.
- `definePreset` refuses a collection named after something the preset owns, with the collection and the
  reason, so the server does not start: every permission prefix its own pipelines require (`system`,
  `images`, `insights`, `migrations`, `users`, `media`), the first segment of its own routes and the
  segment after `/admin/` (`events`, `links`, `paths`, `references`, `replication`, …) and the admin's own
  pages. Rename such a collection before upgrading; `kestrel upgrade check` reports it as
  `preset/collection-name-reserved`. The new `reservedCollectionNames()` answers the list with the reasons.
- A slug belongs to its locale: a page or mounted document is reachable in a locale only through a slug of
  its own there. A translation without one answers 404 (also with `untranslatedPages: "redirect"`, which now
  applies only to a translation that has its own slug but inherits other fields), gets no `_paths` entry,
  static page or automatic redirect, and a link to it in that locale is broken; saving it as published
  answers `400` on the slug field, through the admin and the API. Every path segment comes from a slug of
  the path's own locale: a subpage or mounted document can be published in a locale only when every page
  above it has a slug there (`400` on the parent field, the slug field for a mounted document, naming the
  page), and clearing a page's slug, removing its translation or moving a mounted collection while
  documents below are published in that locale answers `400` naming them. `kestrel upgrade data` reports
  stored translations published without a slug and documents published below a page without a slug in
  their locale as `data/translation-slug`, naming the default-locale slug to copy only where that locale is
  published.
- `GET /api/<collection>` and `GET /api/admin/<collection>` without `limit` answer at most 200 items
  (`content-default`'s `defaultLimit`, which defaults to its `maxLimit`) with the full `total`, instead of
  every match; read further pages with `offset`. The admin's lists and pickers already page.
- Rich text keeps an element's `id` only when it starts with an ASCII letter, holds at most 64 ASCII letters,
  digits, `-` and `_`, and is not `teleports`, `site-main` or an id starting with `nuxt`. The backend drops
  an id outside the pattern when it saves; `useSanitizedHtml()` drops those and the three reserved ones
  when it renders, and in the browser also sanitizes a value taken from the server's payload again. Stored
  content needs no migration: an id outside the rule stops rendering at once, and one outside the pattern
  is removed on the next save.
- A `single` collection with a workflow (a `status` enum, or one declared in `collectionsUi`) reads through
  `?status=<live>` on `get<Name>`: `GET /<name>` answers `404` while the stored document is not live. The
  admin reads and edits it through the new `getAny<Name>` (`GET /admin/<name>`, `<name>.manage`), so a role
  that edits such a single needs `<name>.manage` too. The boot check that a public read keeps its status
  filter now covers `single` collections, so an override of `get<Name>` without the filter stops the server
  with the collection and pipeline named.
- A `link` field, a collection `json` field shown as a link through `collectionsUi.fieldOverrides`, and an
  external `settings.navigation` link accept only `http:`, `https:`, `mailto:` and
  `tel:` targets or a site-relative one (`/…`, `#…`, `?…`); a save with any other target, `javascript:` and
  `data:` included, answers `400`, and a link value may no longer carry members its type does not store.
  `useLinkHref()`/`linkHrefOf()` return `null` for such a target and for an internal link whose path is not a
  site path, so the starter template's and playground's hero render no link for it. `kestrel upgrade data`
  reports stored values outside the rule as `data/link-target`. The server does not start while a field the
  collection UI shows as a link lacks `validate.check:<collection>.<field>` in its write pipelines.
- **The layer ships no binary; `kestrel` from `@michaelthielemann/kestrel-cli` checks and upgrades a
  project built on it.** Add `@michaelthielemann/kestrel-cli` to `devDependencies` at the same range as
  `@michaelthielemann/kestrel` (`kestrel upgrade fix` adds it) and run `kestrel upgrade check|fix|data`
  and `kestrel check`. The layer registers its plugin through a `kestrel` field in its `package.json`
  (`plugin`, `pluginApi`, `engine`); the CLI finds it among the project's direct dependencies. Install
  this release of the layer before running the 6.x CLI: with a 2.x layer installed, the CLI reports
  `deps/host-outdated` and `fix --write` and `data` stop before writing. `scripts/host-binary` rewrites
  scripts that still call `kestrel-web-upgrade`.

- **A module entry `presetModuleConfig()` builds no longer carries its derived config in `config`.**
  It moved to `defaults` (`{ from, values }`); `config` on that entry is `undefined` unless an
  `overrides` key names it. Code that read `presetModuleConfig(...)[i].config` directly — a build
  step, a custom module list, a test — now sees nothing there for a module the preset built. Read
  `effectiveModuleConfig(entry)` from `@michaelthielemann/kestrel` instead; it returns the same
  merged config either way.
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

- `RedirectHit` (`layers/core/app/types/api.ts`) is now derived from the generated 200 response of
  `GET /site/{path}` instead of hand-written; its `status` narrows to `301 | 302 | 307 | 308` instead of
  `number`.

- **Media have one URL on every host: `/media/<id>/<name>`.** Media items carry it as `path`, next to
  `variants[].path`, plus `available` (whether the item may be put into content yet), and no longer carry
  `key`, `checksum` or `status` (the `MediaStatus` type is removed). `presetModuleConfig()` sets
  `publicPath: "/media"` on `media-default` and `images-default` (`images-default` used `/api/media`);
  with the `delivery` feature both modules also keep public copies under `site/media/`, so the static
  export holds every media file an anonymous visitor may read, at the same URL as the live site. The
  server answers `/media/**` itself, next to the `/api` mount; the API under `/api/media` is unchanged.

  - Build no media URL from an id. `pickImageSources` returns `item.path` for an item with no matching
    variant and otherwise links the named variant's `path` and planned dimensions whatever its state —
    it used to build `/api/media/<id>/file` and link only a `done` variant. An item can be inserted into
    content only once its variant paths exist, so a page never needs a republish for a variant to appear.
    `KestrelImage` sets `aspect-ratio`/`object-fit: cover` on a linked variant. A page's `og:image` now
    comes from its share image's `path` (`useMediaItem`, a stable `media:<id>:<locale>` key, a 404
    resolving quietly to no image). The admin's `useCapabilities().mediaFileUrl` and `useApi().mediaVariantUrl`
    are removed, and `KestrelMediaThumb` takes `path` instead of `id`. Code that built
    `/api/media/<id>/file` itself must read `path` from the item instead.
  - Listing media or its folders (`GET /api/media` without `ids`, `GET /api/media/folders`) now requires
    a signed-in caller and answers `401` to a public request; reading one item by id stays anonymous.
  - The media picker and the media field refuse to add an item whose `available` is `false`
    (`isInsertable`, `layers/admin/app/utils/media-insert.ts`); the picker shows it as not selectable and
    keeps polling until it settles, without reopening the dialog, and the upload tile shows "Processing…"
    until then. "Use selected" checks the newly picked items once more and, if one turned unavailable,
    names it and adds nothing. Ids a field already holds are never gated: the field keeps a stored id
    that is unavailable (with a hint), the picker lets it stay selected or be deselected, and it never
    blocks adding other items.
  - With `eventsQueue`, placing an upload's variant paths (`planImageVariants`, main lane) and rendering
    them (`generateImageVariants`) are two pipelines connected by the new event `images.planned`;
    `generateImageVariants` runs in the queue's own `variants` lane (`events-queue`'s `lanes` config), so
    a render never blocks placing the next upload and a batch of uploads becomes insertable file by file
    without waiting for the renders behind it. Without `eventsQueue`, `generateImageVariants` still runs
    inline in the upload request. Deleting a medium removes the file before its image variants
    (`deleteMedia`, `deleteMediaFolder`); an override of either pipeline must keep that order.
  - `deleteMediaFolder` now ends by raising `media.deleted` with the ids of the removed items (`id` is
    `null`); a pipeline of yours triggered by `media.deleted` now also runs for a folder deletion.
  - `listMediaFolders` now requires a signed-in caller (`authn.requireUser`, was `authn.identifyUser`).
  - With `delivery`, anonymous visitors must be granted `media.read` (the playground config and the
    project template already do) or the server refuses to start.
  - Page slugs `api`, `admin` and `media`, and locales of those names, are rejected.
  - The Node boot check that used to log a mismatched `images-default.publicPath` now fails the boot
    outright (`assertMediaPaths`), and checks more: both media modules answer on `/media`, the trigger
    table can reach `media.serve`/`images.serve` there, and, with `delivery-static`, both modules have a
    `publicCopy` under its export prefix and its `reservedPaths` contains `/api`, `/admin` and `/media`.
    For a hand-written module list: set `publicPath: "/media"` on both media modules, add
    `publicCopy: { prefix: "site/" }` to both and `reservedPaths: ["/api", "/admin", "/media"]` to
    `delivery-static`, and remove its `media` option, which the module no longer accepts.
  - System → Delivery gains "Repair public media copies" next to "Re-render all pages", backed by the new
    `repairPublicMedia` pipeline; the copies are also checked by a nightly cron, `syncPublicMedia`.
  - Static hosting: route `/media/` to the site export like the pages, with the security headers and the
    cache rules `docs/consuming-kestrel-web.md` §8 spells out (an original is cached for a year, a variant
    path revalidates on every request until its render replaces the placeholder there).
  - `presetModuleConfig()` refuses to build when `media-default` ends up with `publicCopy` set (the
    `delivery` feature sets it) and allows `image/svg+xml` without the `sanitizeSvg` feature enabled: an
    unsanitized SVG is public at the same origin as the admin. The check reads the configuration after
    `overrides` are applied and matches types exactly as `media-default`'s own boot check does
    (`mediaTypeAllowed` from `@michaelthielemann/kestrel-contracts/helpers/mediaType`: case and parameters are
    ignored, `*` and `*/*` match every type, `image/*` every image type, and a malformed pattern nothing).
    Add `sanitizeSvg` to `features` or deny the type in `media.deniedTypes`.
    `create-kestrel` preselects `sanitizeSvg` and adds it whenever `delivery` is chosen.

- **A statically delivered site no longer calls `/api` after it loads.** The exported HTML carries
  `data-kestrel-delivery="static"` on `<html>`. On such a page, following a link fetches the target page's HTML
  from the static host and takes the page's data from it instead of calling `/api/site/…`; when that page is
  missing, redirected, or from another build, the browser loads the target page as a document instead. Every
  public page now carries `data-kestrel-build` on `<html>` for that check. Run **Publish all** after upgrading.
  The live site is unaffected.

- On a statically delivered page, `useApi()` no longer sends GET or HEAD requests. It rejects with an `ApiError`
  (status 404, code `STATIC_DELIVERY`) and logs a warning naming the path. Data a page needs must come from
  `useAsyncData`/`useFetch` with a key that does not change between server and browser — never `useId()` — and
  that contains the locale when the data depends on it. Following a link carries over those results only;
  `useState` values are computed again in the browser. Code that needs live data after load calls `$fetch`
  against a route your static host forwards. Other methods are sent as before. The rules are listed in
  `docs/consuming-kestrel-web.md` §8.

- `useSiteSettings()` stores its data per locale under `site:settings:<locale>`. Replace
  `refreshNuxtData('site:settings')` and similar calls with the locale key. The page's own data is keyed by its
  site path (`site:/about` whether the browser opened `/about` or `/about/`), and its
  language links by page id and locale (`site:locales:<id>:<locale>`).

- A media item the public layer loads for display keeps its public fields only (`id`, `path`, `filename`,
  `contentType`, `size`, `width`, `height`, `alt`, `title`, `description`, `provenance`, and per variant `size`,
  `width`, `height`, `format`, `path`). `useMediaItem()` returns that shape (`PublicMediaItem`), and
  `KestrelImage` and `pickImageSources` accept it. Everything a page's data holds is published with the page, on
  the live site and in the static export, so keep your own `useAsyncData` results to what visitors may see.

- `renderer-nuxt` refuses to publish a page whose payload is not embedded in the HTML (a route with an `isr` or
  `cache` rule) or that is not rendered on the server, with `RENDER_FAILED` naming the cause. Such pages could not
  hydrate on a static host.

- **Pages are re-rendered as soon as content they show changes.** With `delivery`, saving the settings, an
  entry of any collection, a page or a media item marks every published page whose last render read it, and
  a media item whose image variants changed does the same; marked pages are rendered right away — with
  `eventsQueue` by the queue's worker, one job per page and language, otherwise by a background loop in the
  same process. A save never waits for them; the saved page itself is still published before the response.
  - `setSettings` and every single collection's `set<Name>` write inside an atomic group and emit
    `settings.updated` / `<name>.updated`, with or without `delivery`; an override must keep the group.
  - `llms.txt` is rewritten in the background after the pages it summarizes: `PUT /settings` and page saves
    answer without `_llms`, and neither the save nor the queue's main work waits for the export.
  - **Re-render all pages** (`POST /admin/publish-all/pages`) queues every page and answers at once with
    `{ marked }` instead of `{ documents, live, errors }`; System › Static delivery shows the progress.
    `PublishAllReport` is `{ marked }`. It no longer repairs media copies; use **Repair media copies**, which
    the nightly job also runs.
  - After every deploy, the first start re-renders every page in the background; "Publish all" after a
    deploy is no longer needed.
  - What a page reads during server rendering through `/api` is what it depends on; data from other servers
    or from a cache kept across requests is not tracked.
  - A hand-written module list needs `dependencies: { render, rendererReadsDocument: true }` on
    `kestrel-delivery-static` (`render: "events"` with `kestrel-events-queue`, `"background"` otherwise);
    `definePreset()` refuses a mismatch, naming the key. With the queue it also needs the `lanes` of
    `lanesFor(features)` on `kestrel-events-queue` (`pages` for page renders and `llms.txt`, `variants` for
    image variants), so re-renders never delay uploads, publishing or the login audit; `definePreset()`
    refuses a queue entry without `lanes`, a lanes config that keeps page renders or image variants out of a
    lane of their own and one that names a pipeline it does not compose. `presetModuleConfig()` sets both.
  - With `delivery`, `definePreset()` refuses an override that drops an `events.emit:` step a dependents
    pipeline listens to (`settings.updated`, `<name>.updated`, a page or media event), naming the pipeline.
  - A save response's `_events` also lists the dependents pipeline it started (`queued` with the queue, so
    `_events.status` becomes `"pending"`); read a page's own publishing from its `publishPage` or
    `unpublishPage` entry.

- `presetModuleConfig()` derives the references target of a `ref` field with `to: "media"` as
  `{ media: true }`, the files `media-default` serves through `media@1`, instead of
  `{ collection: "media_items" }`.

- **Visitors without a session receive only the fields `anonymousFields` grants**, and a public page keeps
  that shape in its data for every viewer, signed in or not: a page carries no `createdAt` or `updatedAt`
  (`useSitePage()`, the page's `site:` data). The preset grants, for the content types and media
  `roles.anonymous` may read, every model field and the public media fields and file headers, and the
  redirect rules; a media item's `folder`, timestamps, `available` and `variantCounts`, a variant's `bytes`
  and `state` and every other file header are cut. `presetModuleConfig()` takes the `exclude` and
  `overrides` you give `definePreset()` as its new `pipelines` option and derives no grant for a resource
  whose every preset read they exclude or override without its field step; pass one
  `PresetPipelineChanges` object to both, as the template now does, or the server does not start when you
  exclude every read of an anonymously readable resource. Set `roles.anonymousFields` in
  `presetModuleConfig()` to grant a resource differently, field by field (an empty list removes it);
  `roles.fields` gives a role its own grants. Show a date on a page through a field of your content model.
  - A hand-written module list adds `anonymousFields` to its `authz-roles` entry, or the server does not
    start; `presetModuleConfig()` sets it.
  - A pipeline override of a public read (`resolvePage`, `readPage`, `listPages`, `getSettings`,
    `getMedia`, `listMedia`, the media file routes, `renderRedirects`, `getRedirects`, a collection's
    `list`/`read`/`get`) that anonymous callers reach must end with the preset's
    `authz.fields:<resource>?shape=<shape>` step; otherwise the server does not start and names the
    pipeline. So must a pipeline of your own that anonymous callers reach, with a grant for its resource.
  - `MediaItem` is the signed-in media answer; `PublicMediaItem` and the new `PublicPageDocument` are the
    API's anonymous answers. The generated 200 of a public read is a union of both answers; read one through
    `FullOf<'getMedia'>` or `AnonymousOf<'getMedia'>` (only an operation with an anonymous answer). `previewPageDocument()` takes the preview document
    alone and returns a page without timestamps; a preview snapshot no longer carries `updatedAt`.
  - A step that throws answers `unexpected <ErrorName>` instead of its message, and a step that ends a run
    with `ctx.done()` needs `terminalOutput` (kestrel 6).

- The admin schema's `SerializedCollection` no longer carries `pageLike` (derived from `"slug" in
  fields`). It now carries `routed`, `published` and `hasSlug`, decided in one place instead of from the
  collection's field shape: `routed` comes from `isRoutedCollection`, which names the collections the
  preset routes into the public `resolvePage` route — by collection name, only `"pages"` today, the same
  check `collectionVerbs` already used; `published` is true when the collection's `publishStatus`
  pipeline both exists and actually booted (has an HTTP trigger), independent of the calling user's
  access; `hasSlug` is the plain field check the slug column used to key off. A collection that carries a
  `slug` field but no delivery pipelines (for example a plain `news` collection) no longer loads a
  publish status or shows delivery toasts in the editor; only `pages` wires that way today.
  `validateReservedFields` now requires `title` and `status` on a collection that is `routed` or
  `published`, not on one that merely has a `slug` field. `serializeCollection`/`serializeCollections`
  take this routing information as a required parameter (moved before the existing `customTypes`
  parameter) instead of defaulting it, so a caller must decide it rather than silently skipping the
  reserved-field check.
- **A page's public path is unique, not its slug, and `site-default` owns it** ([`docs/paths.md`](docs/paths.md)).
  `presetModuleConfig()` configures `site-default` with `routes.pages` (the home slug, and the pages
  workflow's live status as `liveWhen`), `prefixPrimary` and the server's reserved paths, and gains the
  options `homeSlug`, `prefixPrimary` and `paths.maxCascade`. Every page write ends its atomic group with
  `site.indexPath:pages` and runs `site.announcePaths` right after it; a save that takes a held path
  answers `409 CONFLICT` naming the path, its locale and the page holding it. The public page list and
  read end with `site.attachPaths:pages?reachable` before their field cut, the admin ones with
  `site.attachPaths:pages`, and every page answer carries `_paths` (granted to anonymous callers).
  `pages.slug` must not be `unique`; the playground and the `create-kestrel` template drop the flag, and
  the reserved-segment value schema on page slugs is gone (a reserved path is a slug field error from
  `site-default`, now on the full path). An override of a page write, list or read that lacks these steps
  fails to boot; `kestrel upgrade fix` inserts them (`preset/override-path-steps`). A hand-written
  module list must configure `site-default`'s `routes` the same way.
- The server refuses to boot when `site-default`'s `prefixPrimary` or home slug differs from `shared/model`'s
  `prefixPrimary`/`homeSlug`: pass both to `presetModuleConfig()` (and `homeSlug` to `definePreset()`, checked
  as `preset/home-slug`), as the playground and the `create-kestrel` template do.
- With a mounted collection, `settings.mounts` is required: a `PUT /api/settings` without it answers 400
  instead of resetting the assignment for every locale.
- `isRoutedCollection(name, model)` (from `#kestrel/pipelines`) takes the collection's model: `pages` and
  every multi collection declaring `mount: true` are routed. `delivery-static` delivers the routed collections
  only; a collection that merely carries `slug`, `status` and `body` is no longer exported. The admin's
  `buildAdminSchema()` takes the preset's model as `collections` to read the mount flag. `routes` is a
  reserved collection name. With a mounted collection, `resolvePage` can answer `{ route: { type } }` and
  `PublicSiteResponse` gains `RouteHint`.
- The preset's default `session.minPasswordLength` is 12, as in `kestrel-authn-multi`. It applies when a
  password is set: an existing shorter password still logs in. The admin's password fields ask for at
  least 12 characters.
- `envBlobstore()` passes `allowInsecureEndpoint: true` to the S3 blobstore when
  `KESTREL_S3_ALLOW_INSECURE_ENDPOINT=true`; without it, a plain `http://` `KESTREL_S3_ENDPOINT` outside
  loopback stops the boot (a `kestrel-blobstore-s3` rule). The documented `/api/` forwarding from a static
  host proxies over TLS with certificate verification and passes the forwarding headers.
- `definePreset()` refuses a `kestrel-replication-sqlite` prefix or a `kestrel-backup-blobstore` key that
  overlaps a public prefix (`site/`, or the `prefix`/`publicCopy.prefix` of `delivery-static`,
  `redirects-default`, `media-default`, `images-default`), with `preset/private-prefix-public` from
  `checkPreset()`. `docs/deployment.md` lists which blobstore keys may be public and gives a bucket policy
  that serves `site/*` only.
- `create-kestrel` preselects the `ratelimit` feature, so a scaffolded project limits failed logins per
  client address (five per minute), also with `--yes`. It asks for an admin password of at least 12
  characters and refuses a short list of well-known passwords.
- The admin no longer reads or writes the session cookie: the login response sets it as
  `__Host-kestrel_token` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`), logout removes it, a cookie
  named `kestrel_token` is no longer read (everyone signs in once more), and every admin request relies on the browser sending it.
  `useApiToken()` and `TOKEN_COOKIE` are removed from the admin composables, and `sessionStateFor()` answers
  the session state alone. A `POST`, `PUT`, `PATCH` or `DELETE` to `/api` authenticated by the cookie must
  come from the same origin, and a non-JSON request body is answered 415. The site is served over HTTPS in
  production (see the deployment guide's reverse-proxy section); `session.secureCookie: false` in
  `presetModuleConfig()` is for a plain-HTTP development host only.
- Creating, changing, deactivating, activating and deleting users, setting a password, anonymising a user's
  audit entries and restoring a replication point need a password check from the last five minutes: those pipelines run
  `authn.requireRecentAuth:300` and answer `403 REAUTH_REQUIRED` otherwise. The new `confirmPassword`
  pipeline (`POST /me/confirm-password`, rate-limited with the `ratelimit` feature) renews the check, and the
  admin asks for the password in a dialog and repeats the action. `setPassword` refuses the caller's own
  account.
- A signed-in account without a configured role may only sign out and read its own identity: the preset runs
  `authz.requireRole` after `authn.requireUser` in every pipeline but `me` and `logout`, consumer overrides
  included, so `GET /api/admin/schema` and every other route behind a login answer it 403, and the admin shows
  it a notice with the sign-out instead of the navigation. Listing the media library and its folders needs
  `media.list`; `presetModuleConfig()` adds it to every role that grants `media.read`, and the admin shows the
  library only to a caller who may list its folders. The
  schema composable's `SchemaOutcome` gains `'forbidden'` and its state a `forbidden` flag.

- **Forwarding headers count only from a trusted proxy.** The new `NUXT_KESTREL_ACCESS_TRUSTED_PROXIES`
  (`kestrel.access.trustedProxies`, addresses or CIDR ranges, default loopback) lists the peers whose
  `_TRUSTED_HEADER` or `X-Forwarded-For` is read, for the IP allowlists, `ctx.ip` and rate limits alike; any
  other peer is judged by its own address. A proxy that does not connect over loopback (a container
  setup, a proxy on another host) must be listed. A request from a trusted proxy without the configured
  trusted header is refused with 403 even when no allowlist is set, and with `_TRUST_PROXY` a trusted
  proxy's request without `X-Forwarded-For` has no client address instead of the proxy's; only
  `GET /api/health` and `GET /api/ready` still answer without the trusted header, judged by the peer
  address against the `site` list and with `{ ok }` or `{ ready }` alone. A request from an untrusted
  peer that carries the forwarding header is logged once per peer and hour, and `check`'s new info rule
  `ops/trusted-proxies` names each project file that sets `_TRUSTED_HEADER` or `_TRUST_PROXY` without
  `_TRUSTED_PROXIES`. **Upgrading:** find the address your proxy and your platform's health check
  connect from and list it in `NUXT_KESTREL_ACCESS_TRUSTED_PROXIES` unless it is loopback. The server
  utility `clientAddress` is replaced by the core's `clientIpResolver`.
- `UploadTransport` takes an options object as its third argument, `{ onProgress?, signal?, timeoutMs? }`,
  instead of a bare progress callback. A transport that replaces `useUploadTransport()` reads the callback
  from `options.onProgress`, aborts the request when `options.signal` aborts and gives up after
  `options.timeoutMs`. `UploadStatus` gains `'cancelled'` and `'skipped'`, and a file over the upload
  limit is `skipped` rather than `failed`. `useMediaUpload()` calls `onError` for every failed file, a 401
  included, and never for a skipped one.
- The media library's upload list is replaced. `MediaUploadQueue` is removed; `MediaUploadPanel` and
  `MediaUploadRow` take its place. `MediaToolbar` has no `status` prop, since the panel is the only live
  region for uploads, and gains `quietCount`, which turns off the live region of its file count.
  `useMediaLibraryUploads()` takes `root`, the library element, and `listedIds`, the ids of the listed
  files, instead of `onError`, and returns `followUp`, the image-variant line, in place of `status`.
  Neither it nor `useUploadTiles()` returns `queueRows`; `useUploadTiles()` takes `listedIds` too.
  `uploadStatusLine` and `UploadStatusInputs` are removed from `useMediaUpload`. An app that overrides one
  of these components or reads one of these fields moves to the panel.
- The admin translation keys `media.uploading`, `media.uploadUploaded`, `media.uploadFailed`,
  `media.uploadSkipped`, `media.uploadError`, `media.tile.announceUploaded`, `media.tile.announceReady`,
  `media.tile.announceFailed`, `media.upload.desc` and `upload.tooLarge` are removed, so an override of
  one of them is reported as an unknown key. The upload dialog's description uses `media.upload.descOne`,
  `media.upload.descCount`, `media.upload.skippedOne` and `media.upload.skippedCount`, and finished image
  variants are announced with `media.upload.variantsReady` and `media.upload.variantsFailed`.
  `media.uploadTooLarge` and `media.uploadUnsupported` receive only the file size or the content type as
  `{detail}`, and `media.upload.dismiss` reads "Dismiss {name}", since it also dismisses a cancelled or
  skipped file.
- `updateUser`, `deactivateUser` and `deleteUser` run `authn.updateUser`, `authn.deactivateUser` and
  `authn.deleteUser` in an atomic group, with and without the `eventsQueue` feature, so two admins who
  demote, deactivate or delete each other at the same time leave one admin and the other request answers
  `409 LAST_ADMIN`. An `overrides` entry for one of the three pipelines that runs the step outside a group
  is refused like a content write that loses its group (`preset/override-drops-atomic-group`); wrap the step
  in `{ atomic: [...] }`.
- The boot check of the workflow status filter covers every `site.resolve:<collection>` and
  `site.resolveLinks:<collection>` step of a collection with a workflow: a step that does not carry
  `<field>=<live>` fails the boot, unless it runs after `authn.requireUser` as a signed-in preview.
  kestrel's site-default refuses the same override against the `liveWhen` `presetModuleConfig()` derives.
- `roles.anonymous` takes read permissions only (`<collection>.read`, `media.read`): kestrel's authz-roles
  refuses `*`, `<collection>.*` and every other permission there when the server starts. Replace a wildcard
  with the reads it stood for.
- The preset hands kestrel's redirects-default the paths the server answers itself or Nuxt's tooling reserves as
  `reservedPaths`: `/api`, `/admin`, `/media`, the build assets path, `/__nuxt_island`, `/__nuxt_error`, `/_ipx`
  and `/_preview`. The build assets path is `/_nuxt` unless the site moves it: `presetModuleConfig()` takes it
  from the new option `buildAssetsPath`, by default from `NUXT_APP_BASE_URL` and `NUXT_APP_BUILD_ASSETS_DIR` as
  they are set when the server starts. A site that moves the build assets at build time, in `nuxt.config.ts` or
  through those variables, sets `buildAssetsPath` to the joined path, such as `/assets`, or sets the same variables
  at start too. System → Redirects refuses a source that equals, lies below or, through a wildcard, can match one
  of them (`/admin/x`, `/*/login`) with the row's message. A rule already stored under one is neither applied by
  the Node origin nor exported to `redirects.json`; the server logs each skipped row. Check the rules under
  System → Redirects against the list before upgrading. A wildcard in the first segment (`/*/old-page`) always can match a reserved
  path: write the rule once per prefix (`/de/old-page`, `/en/old-page`). `/administration`
  stays allowed. `overrides` for redirects-default can replace the list.
- `POST /admin/users/:id/revisions/reassign` (`retryReassignRevisionAuthor`) and
  `POST /admin/users/:id/audit/anonymize` (`retryAnonymizeAuditUser`) answer 409 while `:id` still names a
  user, active or not, and 400 when it is not a UUID. Both run `authn.requireAbsentUser` first (the audit route
  after its check of a recent password), and both raise `user.revisionsReassignRetried` or
  `user.auditAnonymizeRetried`, which the new pipeline `auditUserRepairs` records with `audit.recordActor`: the
  audit log shows who ran the repair without naming the deleted user. The responses carry `_events` now.


### Changed

- The `create-kestrel` starter labels its pages collection, fields, status choices and the Hero and Prose block
  fields in English and German, so a German admin interface shows German labels.
- `useSanitizedHtml()` applies one allowlist on the server, during server rendering and in the browser; the lists
  and the attribute rules come from `@michaelthielemann/kestrel-contracts/helpers/html-allowlist`, the helper
  the backend's `format: html` sanitizer uses. A link whose `target` is anything but `_self`, in any letter case,
  gets `rel="noopener noreferrer"` and loses `opener`. A `data:` link and a link or image source that starts with
  two slashes or backslashes are dropped (`data:` stays allowed for `img[src]`). The server trims the spaces
  around an attribute value, as the browser does, so both produce the same markup. In the browser, `data-*` and
  `aria-*` attributes and attributes the tag does not carry no longer survive, as they did not on the server;
  `data-kestrel-broken` stays on links on both sides.
- The `nuxt` peer range and the `@nuxt/kit` dependency are ^4.6.4 (were ^4.5.2): Nuxt 4.5.x and 4.6.0 to 4.6.3
  carry published advisories in `nuxt`, `@nuxt/nitro-server`, `@nuxt/schema` and `@nuxt/vite-builder`. A site on
  an older Nuxt 4 raises its own `nuxt` to ^4.6.4; `create-kestrel` writes that range into a new project.
- Dependency ranges: `dompurify` ^3.4.17 (was ^3.4.14), `sanitize-html` ^2.18.1 (was ^2.17.7) and `devalue`
  ^5.9.3 (was ^5.9.1); each floor is the first release without a published advisory. `sanitize-html` 2.18
  declares `engines.node` >=22.12.0, inside the layer's own >=22.18.0.
- `create-kestrel` writes `overrides` into a new project's `pnpm-workspace.yaml` that resolve `glob@13` as
  ^14.0.2 and `minimatch@10` as ^11.0.1: Nuxt's Nitro server reaches both through `@vercel/nft` and `archiver`,
  and every release of glob 13 and minimatch 10 carries a published advisory. A site on pnpm adds the same
  entries to its own `pnpm-workspace.yaml` for a `pnpm audit` without these findings. A site that lints with
  `@nuxt/eslint` and whose lockfile pins `eslint-plugin-import-x` below 4.18.0, the first release that loads
  against minimatch 11, runs `pnpm update --depth Infinity eslint-plugin-import-x` (with `-r` in a workspace) or
  resolves its lockfile from scratch: `pnpm install` keeps the pinned release. `docs/consuming-kestrel-web.md`
  (§11, "Entries a new project has in pnpm-workspace.yaml") lists the lines an updated project copies.
- The `pnpm-workspace.yaml` that `create-kestrel` writes ignores one advisory through `auditConfig.ignoreGhsas`:
  GHSA-gcqx-w48m-w2h4 in `deepmerge`, reached only through Nuxt's development toolchain (`nitropack` >
  `@rollup/plugin-node-resolve`) and absent from a production build. `nuxt` is a dependency, so
  `pnpm audit --prod` reaches it too. `ignoreGhsas` has no expiry date: remove the entry once a fixed `deepmerge`
  release resolves or Nuxt no longer pulls `deepmerge`, and review it no later than 2027-02-13.
- Media library and picker: "Delete" moves files and folders to the media trash instead of deleting them, so
  their files keep using storage until the nightly purge, 30 days later by default
  (`media.trashRetentionDays`; `0` keeps the final delete behind a dialog). A page that shows a trashed item
  is published without it, and the item comes back with its URL on restore; when the page is re-rendered
  between the two depends on `delivery`. Without the trash, the final delete now tries every selected item,
  reports each failure and reloads once at the end instead of stopping at the first failure.
- Redirects: `redirectRules` grants `from` next to `pattern`, `target` and `status`, so `GET
  /redirects.json` and `PublicRedirectRule` carry each rule's wildcard path; the `redirects.rules` schema
  refuses a `from` longer than 512 characters and more than 1000 rules. The Node origin matches `from` in time proportional to
  the path; "Redirects at the edge" describes the same for the njs handler and the cost of the `map`
  variant.
- Media: an upload declared as an image type or PDF whose bytes are another type is treated as that
  type (so SVG or HTML markup sent as `image/png` is refused by the default `deniedTypes`), and image
  variants are rendered only from originals whose bytes match their stored type.
- The editor's save and delete messages report only the publishing of the page itself, not other background
  work started by the same save.
- The dashboard shows how many event deliveries failed for good and links to System → Events: the
  queue's dead letters, or with inline delivery the failed deliveries of the process that served the
  page. `/api/ready` and `/api/health` answer as before.
- System → Events is available with inline delivery too; it shows the failed deliveries of this process,
  since when, and a pointer to Insights → Live.
- The insights page lists the boot warnings of the instance above its tabs, each with every context
  field it carries.
- Deleting a user reports a failed follow-up task (revision reassignment, audit anonymisation) instead
  of a success message. Otherwise the toast names the outcome, the user the writing now belongs to or the
  anonymised author reference, and adds that the follow-up tasks run in the background while the events
  queue still holds one (new admin message `users.followUpQueued`).
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
- Admin: the origin label ("AI-generated", "Partly AI-generated", "Origin unknown") no longer sits on the tiles
  of the media field, where it covered the remove and crop buttons, nor in the media picker. The media library
  shows it as a `KestrelUiBadge` on the grid thumbnail's top right corner, clear of the checkbox and the menu
  button, and beside the filename in the table.
- Admin kit: `KestrelUiButton` gives every styled variant and `icon` a dedicated disabled state instead of a flat
  opacity. The new tokens `--color-disabled-bg`, `--color-disabled-text`, `--color-disabled-border` and
  `--color-disabled-icon` (base, light and dark; the label stays at 3:1 or better) make a disabled `ghost`,
  `danger-ghost` or `icon` button clearly weaker than an active one; a disabled `danger-ghost` label takes
  `--color-disabled-icon`, which is lighter (light theme) or darker (dark theme) than `--color-danger` and at least
  1.4:1 away from it in both themes. The unstyled `bare` variant keeps
  the look of its call site and only gets the `not-allowed` cursor. A disabled button, or a link with `disabled`,
  never shows a hover state and has the `not-allowed` cursor; a raw element with a kit class and the `disabled`
  attribute gets the same look. A disabled link renders without a destination, always carries `aria-disabled="true"`,
  `tabindex="-1"` and `role="link"`, and neither navigates nor runs an `onClick` listener of the caller (`@click` and
  its `.once`, `.passive` and `.capture` forms; `@click.right` and `@click.middle` compile to `contextmenu` and
  `mouseup` and still run). A button that is `loading` is never styled as disabled, even
  with `disabled` set, in every variant; it is dimmed to 60 % opacity with a progress cursor.
- The admin layer sends `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`,
  `X-Content-Type-Options: nosniff` and a `Permissions-Policy` that turns off camera, microphone, geolocation,
  payment and USB on every route under `/admin`, as a route rule of `layers/admin/nuxt.config.ts`. The public
  site and `/api` are unchanged, and no Content Security Policy is set. A page on another origin can no longer
  embed `/admin` in a frame; the editor's preview frames the public site from the same origin and keeps
  working.
- `create-kestrel` writes `.env` readable and writable by its owner only (mode `0600`), also when `--force`
  replaces an existing file. The help and the README say that `--admin-password` is visible in the process list
  while the command runs and recommend `KESTREL_ADMIN_PASSWORD` instead.
- With `--pm pnpm`, `create-kestrel` pins `packageManager` in the new `package.json` to the pnpm release this
  repository runs, and its `pnpm-workspace.yaml` sets `minimumReleaseAge` (three days), `trustPolicy: no-downgrade`
  (not applied to releases older than 90 days, `trustPolicyIgnoreAfter`) and `blockExoticSubdeps: true`. `@michaelthielemann/*` is listed in `minimumReleaseAgeExclude`, so a freshly
  published `kestrel` or `kestrel-web` installs at once. With `npm`, `yarn` or `bun` the project has no
  `packageManager` field.

### Fixed

- Media library: the "Variants failed" chip on a tile wraps instead of being cut off on a narrow tile, and its tooltip
  and screen-reader text point to System → Images, where the failed variants are retried. Users who cannot open that
  tab or retry variants are told that an administrator can retry them. The i18n keys `media.tile.variantsFailed` and
  `media.tile.variantsFailedHint` are replaced by `media.tile.variantsFailedRetry` and `media.tile.variantsFailedAsk`.
- Media library: the table and the viewer show the dimensions of an image after its EXIF rotation, matching the
  crop editor, the variants and the site, instead of the stored width and height of the file.
- Media picker: opened a second time on the same page, it starts in the folder last browsed instead of the top
  level, and no longer overwrites the remembered folder with the top level.
- Media library: opening a file with a double click leaves its selection as it was, also when the file is already
  selected alone or inside a multi-selection. The second click of the double click no longer toggles the selection,
  and a click that deselected the file is undone when the double click opens it.
- Crop editor: a number field in which the value already shown is typed again no longer stays on that value while
  the crop moves; leaving a field applies what was typed, and the editor no longer counts an unchanged value as an
  unapplied edit.
- Media library: after several selected items are deleted, focus lands on the first remaining item after the
  focused one; it no longer skips ahead by the number of items removed before it.
- Redirects editor: a rule whose "To" points at an address that is already redirected automatically is described
  as a chain of two redirects, with the advice to point at the final address, instead of as a loop.
- Admin slug field: a site whose `homeSlug` is not `"home"` shows its start page with an empty slug and saves an
  empty slug as that `homeSlug`, as it does for `"home"`. `GET /api/admin/schema` returns `homeSlug`.
- Page slug: a top-level slug that is a language code of the site (`en`, `de`) is flagged under the field while
  it is typed, as a reserved segment already is. The refusal of such a slug and the `409` of a path another page
  holds show in the admin language, in the field and in the form error, instead of the server's English text.
- Public media: `HEAD` on `/media/<id>/<name>`, on a variant and on `/api/media/<id>/file` answers 200 with the
  `Content-Type`, `Content-Length` and `Cache-Control` of the `GET` instead of 404. The API answers `HEAD` on
  every route it answers `GET` on.
- Admin page tree: in a language a page has no path in, the row reads "no path" instead of showing the path of
  another language.
- Users: a save or create that carries a role the backend is not configured with shows "Unknown role: …" with
  the rejected names (new admin message `users.unknownRoles`) instead of the backend's
  `authz.validateRoles:roles: unknown role name(s)`. The hint under the roles of the edit dialog
  (`users.rolesHint`) says that only configured roles are accepted. `ApiErrorDetails` carries the rejected
  names as `unknown`, and the failure `apiRequest` hands to `onError` carries the failing `step`.
- System → Replication: "Restore to this point" on a row of the restore points restores the database to that
  row's time. It sends the row's `at` together with its generation; the newest state of the generation is no
  longer what the next start comes up with.
- Admin layout: at 320 CSS px no admin page scrolls sideways or cuts off a control (WCAG 1.4.10 Reflow). The
  main area contains its visually hidden labels; the head of the settings and redirects tabs, the section heads
  of the images tab, the collection list bar and the media toolbar wrap; `KestrelUiButtonGroup` no longer shrinks
  below its widest option; the facts of the inline events tab wrap their labels. On a short viewport the editor
  of the settings and redirects tabs keeps at least 16rem and the tab scrolls to the automatic redirects below it.
- Admin layout: the rail brand link and the account menu trigger are named after the text they show, so their
  accessible name satisfies WCAG 2.5.3 (Label in Name), expanded and collapsed.
- Media picker: a file deleted while the picker is open no longer reaches the field on "Use selected"; a pick
  that is gone when the selection is checked is named, dropped and not inserted. In a multi-pick the context
  menu acts on the picks instead of a second, hidden selection.
- Media uploads: a failed file no longer holds up or affects the others, and no file stays waiting for
  good. Every request settles once, as done, failed or cancelled. A request without an answer fails as a
  timeout after two minutes plus the time to send the file at 32 KiB/s. A callback that throws no longer
  ends the run, and files added during a run join it. An expired session stops the run: that file and the
  ones still waiting say "Session expired", and the panel asks once to sign in again in another tab, with
  a link that opens the sign-in page there. Until the next upload succeeds, the library neither refreshes
  nor polls image variants, so no request sends the page to the sign-in form and the files stay to be
  retried. A refused file names the reason in the admin's language with only the useful detail, such as
  "File type not allowed (application/octet-stream)" or "Too large (6.0 MB, limit 5.0 MB)", never the
  server's module prefix. A failure without an error answer from kestrel names its cause (no connection,
  timeout, server unavailable, refused as too large) together with the HTTP status. A 2xx answer that is
  not a JSON object, or that arrived through a redirect to another address such as a proxy's sign-in page,
  fails instead of counting as uploaded. The toolbar's file count includes the files uploaded since the
  last refresh. Closing the media picker aborts the running upload and drops the waiting ones. No toast is
  raised per failed file. After a retry from a grid tile, keyboard focus moves to the uploaded file once
  the library lists it.
- The layer's `kestrel` CLI plugin and the model reader behind `kestrel upgrade data` compile TypeScript in
  memory only; they no longer keep a transpile cache under the system temp directory, where another local
  account could have placed files that the next `kestrel check`, `explain`, `manifest`, `openapi` or
  `upgrade` would load.
- The admin's `<html>` element carries a `lang` attribute with the admin language, so screen readers
  pronounce the admin in the right language (WCAG 3.1.1).

- A media file or page used only inside a content block could be deleted: the delete guard saw
  top-level `ref` fields such as `shareImage` but not a block's `media` or `relation` field, in a
  `multiple` field, a repeater or a nested block. The generated block schema marks those fields with
  `"x-kestrel-ref"`, and `presetModuleConfig` hands the `json` field schemas to `references-default`
  (with `watch` outside production; a production build hands it the bundled schemas, as the validator
  gets them), so such a delete answers 409 and the media library names the page
  before deleting. `media` and every multi collection are always reference targets. Existing content
  needs no manual step: `references-default` rebuilds its index at the first boot after the upgrade and
  whenever targets, fields or the block schema change.
- The `references` feature wires every generic multi collection, not only mounted ones: its writes are
  checked and indexed, its deletes guarded (409 while a page or block still points at the document) and
  unindexed, and it gets `<name>Referrers(Many)`, which the admin's delete dialog reads. `setSettings`,
  `setRedirects` and every generic single re-index after their write, so an internal link there guards
  its target page and never outlives an edit.

- The editor preview iframe now loads the public site's layout CSS in a production build. Its route
  is rendered client-side only, so a stylesheet reachable exclusively through the lazily loaded
  default layout was never part of the initial page load; it is now registered as global app CSS.

- The media library upload tile no longer announces "uploaded" to screen readers when a session
  expires mid-upload. `useMediaUpload` now fires its `onReady` callback only once an item's status
  reaches `done`; a failed upload (including the swallowed 401) shows its failed state without a
  false success announcement.

- The `[...slug]` page now loads site settings and the share-image media item in parallel instead
  of one after the other, cutting one round trip off every public page render.

- `useReferrerLabels` now logs a lookup failure instead of silently falling back to the raw reference
  key the same way it does when the caller simply has no `readAny` capability for that collection. The
  fallback text is unchanged; only a genuine failure is now visible in the console.

- The editor's delivery-retry toast now names the Events or Delivery tab from the save or delete
  answer's own relay status (`pending`/`queued` only ever come from the events queue) instead of a
  separate `useFeatures().has('eventsQueue')` check. A delivery that fails outright still names the
  Delivery tab, since the answer alone cannot tell a queue failure from a direct one.

- `MediaVariantChip`'s "stalled" wording is no longer a distinct chip state alongside the backend's
  `pending`/`failed` — kestrel reports neither a "stalled" variant status, and the timeout that decides
  it is a client-side observation (`useVariantWatch`'s ten-minute limit), not something the backend owns.
  It is now a `stalled` flag on the `pending` state instead of a third value of `state` itself.

- The status-filter check that boot runs against every workflow-bearing collection now runs before
  `kestrel.start()` instead of after. A failure used to leave crons and, with the `eventsQueue` feature,
  the queue worker running while `/api/*` answered 503; it now stops the process from starting them at
  all.

- `kestrel upgrade`:
  - A `checkPreset()` problem code (already prefixed `preset/` at the source) no longer gets a second
    `preset/` prepended onto its finding id and rule when no more specific rule owns it (`preset/preset/…`).
  - `addModuleEntryConfigProperty` no longer doubles a comma when the object it inserts into already ends
    in a trailing one (`llms: {…},` followed by the new property landed as `llms: {…},\n  , newProperty`).
  - `static/unstable-key` also catches a `watch` on a variable bound to `useSiteLocale()`'s own result
    (`const locale = useSiteLocale(); …; watch: [locale]`), not only an inline `watch: [useSiteLocale()]`
    call; its message now names a project-relative path instead of the scratch directory's absolute one
    (`responses/delivery-async` and `static/server-cache` had the same leak and are fixed the same way).
  - `ops/publish-all` no longer depends on the layer's package.json range: it used to go silent the moment
    that range was bumped to `^3.0.0`, which the docs' own upgrade steps do before the rest of the
    migration is done, hiding the note exactly while it still mattered. It now fires whenever `delivery`
    is on, regardless of any package.json range.
  - `site/media-paths` no longer reports a missing `publicPath` on `media-default`/`images-default`: both
    modules default it to `/media` themselves, which the real boot already accepted, so the finding was a
    false positive against the raw, unparsed config. It also says nothing at all while `delivery-static`
    still has its old `media` option set — `modules/delivery-media` already reports (and, with the layer's
    `mediaWiring`, often fixes) that same wiring, so a project in that state no longer sees the same
    problem reported twice, with two different suggestions.
  - A multi-line module or preset-override config keeps its own indentation and comma style when an edit
    adds a property to it, instead of collapsing onto the object's closing line or leaving a stray comma.

- `sanitizedHtmlKey` is no longer auto-imported into consumer server or app code — it moved out of
  `layers/public/app/composables` into a plain module `useSanitizedHtml` imports, since nothing but its
  own test called it as a global.

- Documented the `server/utils` exports that Nitro auto-imports into consumer server code and were
  missing from this file: `adminBootstrapProblem`, `assertAdminBootstrapRoutes`,
  `bootWithAdminBootstrapCheck`, `buildCapabilities` and its types, and `schemaFromRun`.
  `AdminSchemaSources.triggers` and `.access` are required, not optional — building an `AdminSchema`
  needs the caller's pipeline access to compute capabilities.

- A preset `overrides` entry that keeps `events.relay` but places it before the pipeline's own
  `events.emit:` step is now rejected the same way an entry that drops the atomic group already is.
  Previously the guard only checked that `events.relay` was present somewhere in the list.

- `DeadEvent`, `UserDeleteResponse`, `InsightsModule`, `InsightsPipelineStep` and `InsightsBootWarning` are
  now derived from the generated OpenAPI types instead of hand-written duplicates, so they can no longer
  drift from what the API actually returns. `InsightsModule` gains the `emits` field the API always sent.

- The admin schema builder no longer imports `PipelineVerdict` from `kestrel-authz-roles`'s internal
  `/impl` subpath. It is now a local type derived from the same list its type guard checks, exported
  from `admin-capabilities`.

- The insights configuration table no longer collapses into a one-character-wide path column with
  overlapping header labels at phone width. It sizes its columns to their content and scrolls
  horizontally instead of shrinking; a long value or default now wraps within a bounded width rather than
  forcing every column to nearly nothing.

- The public site resolver replaces the current history entry when it follows a redirect hit, so the
  browser's Back button no longer returns to the redirecting path. A response that is neither a redirect
  hit nor a page is now rendered as an error instead of as an empty page, and a page whose content model
  has a field literally named `redirect` is no longer mistaken for a redirect hit.

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

- `useSanitizedHtml()` now keys its `useAsyncData` call by a hash of the input instead of `useId()`, so
  the server and client compute the same key regardless of how many other components ran first, and the
  client reuses the server-rendered sanitized HTML instead of recomputing it against live data on a
  static export.

- A block field of type `media` or `relation` with `multiple`/`many` set now validates and saves an array
  of ids, matching the `choice` field's existing behaviour, instead of always requiring a single string
  and rejecting every save of the field.

- After switching the language, the header shows the site title and navigation of the new language, and the
  language switch marks the new language as the current one.

- A statically delivered page opened with a trailing slash (`/about/`) no longer requests `/api` while it
  hydrates.

- The public site no longer leaves the browser's 8px body margin around the page, which showed as a light
  frame in dark mode. The default layout, and the error page for any path outside `/admin`, mark `<body>`
  with a `site-body` class while they are mounted (`useSiteBodyClass()`), and `site.css` zeroes the margin
  and paints the body with `--site-bg` and `--site-fg` under that class; the admin is unaffected. The
  `--site-*` variables and the other site tokens are now defined on `body.site-body`, which `.site`
  inherits from, so setting them on `.site-body` re-themes the page and the body alike.
- The IP allowlists judge the path the API routes: dot segments, literal or `%2e`-encoded, are resolved
  before the admin/site scope is decided, so `/api/x/../users` counts as `/api/users`, and the API answers
  400 to such a path.
- The IP allowlists are enforced for a server listening on a Unix socket (`NITRO_UNIX_SOCKET`): such a
  connection counts as loopback and the trusted header decides. Only Nitro's in-process requests during SSR,
  publishing and static delivery pass unchecked. Without `_TRUSTED_HEADER` or `_TRUST_PROXY` the server
  warns at start, since no request there has a client address.
- A path preview is redacted by the pipeline the request was routed to rather than by its path, so a
  trailing slash or a percent-encoded character in the path no longer returns the titles of documents the
  caller cannot manage.
- Admin: System → Replication scrolls when its content does not fit, so the restore point table keeps a minimum
  height and stays reachable on small screens while the staged-restore and restore-result notices are shown. The
  generation wraps at narrow widths instead of being cut off, the tab never scrolls sideways, and after a
  restore the restore result notice takes focus, so it is in view and announced.

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
