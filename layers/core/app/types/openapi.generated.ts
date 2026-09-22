// This file is generated. Do not edit by hand.
// Regenerate with `pnpm generate:api-types`.

export interface paths {
    "/admin/events/dead": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission system.manage → Dead-letter events, most recently failed first */
        get: operations["eventsDead"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/dead/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission system.manage → Requeue the dead-letter event named by params.id */
        post: operations["eventsRetryOne"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission system.manage → Requeue every dead-letter event */
        post: operations["eventsRetryDead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission system.manage → Queue counters per state, the oldest pending event and the worker state of this process */
        get: operations["eventsQueueStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/images/prune": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission images.manage → Delete the variants of sizes that are no longer declared */
        post: operations["pruneImages"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/images/retry-failed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission images.manage → Put every variant that gave up after maxAttempts back to pending with a fresh attempt budget – all of them, or one media item's (id from params.id or payload.id) – and start the work that regenerates them */
        post: operations["retryFailedImages"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/images/sizes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission images.read → Effective sizes (defaults/config merged with the sizes registered in this process) */
        get: operations["listImageSizes"];
        /** Require a valid session → Requires permission images.write → Replace the sizes registered by this instance – code-declared sizes are held in memory, never stored */
        put: operations["registerImageSizes"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/images/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission images.read → Sizes with usage/variant counts, current job, the variants that gave up with their last error, and sizes whose variants are left over from a size the code no longer declares */
        get: operations["imagesStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/images/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission images.manage → Start a sync job, or resume a paused/error/stale one */
        post: operations["syncImages"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/insights/manifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission insights.read → The static manifest of this instance: modules, contracts, config schemas, steps, pipelines, triggers */
        get: operations["insightsManifest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/insights/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission insights.read → Live counters of this process: runs, pipelines, steps, events, and the most recent failed runs */
        get: operations["insightsStats"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/links/broken": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Broken links */
        get: operations["brokenLinks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/links/rebuild": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission pages.manage → Rebuild the link index */
        post: operations["rebuildLinks"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/media/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission media.manage → Copy every media item to /var/lib/kestrel/export/<folder>/<filename> → Copy every done variant to /var/lib/kestrel/export/<folder>/<filename>.<size>.<ext> */
        post: operations["exportMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/media/reconcile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission media.manage → Compare the blobs under the media prefix with the media_items rows; with `delete` also removes blobs that no row points at (rows are never deleted) */
        post: operations["reconcileMediaReport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/media/reconcile/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission media.manage → Like media.reconcile, but always deletes the orphan blobs – the deletion is in the pipeline, not in the request */
        post: operations["reconcileMediaDelete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/migrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission migrations.manage → Applied migrations (ledger, oldest first) and still-pending migrations (config order) */
        get: operations["listMigrations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/migrations/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission migrations.manage → Apply every pending migration; payload.dry === true reports the changes without writing */
        post: operations["applyMigrations"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → List pages */
        get: operations["listAllPages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/pages/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → One pages document */
        get: operations["readAnyPage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/pages/{id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Revisions of one pages document and locale, newest first and without snapshots */
        get: operations["pageRevisions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/pages/{id}/revisions/{revisionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → One revision of a pages document including its snapshot and, where the content model is known, the dry run of its restore under `restore` */
        get: operations["pageRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Require a valid session → Requires permission pages.write → Name a pages revision, or clear its name with null; a labelled revision is never pruned */
        patch: operations["labelPageRevision"];
        trace?: never;
    };
    "/admin/pages/{id}/revisions/{revisionId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission pages.write → Put a pages revision's snapshot into the body, so the steps behind it save it like any other write and branch the history at that revision; fields the model has dropped since are left out → Validate payload field pages.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field pages.body → Validate payload field pages.body against its JSON Schema → Validate payload field pages.accent against its JSON Schema → Referenced ids of pages must exist → Update a pages → Record the saved pages document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a pages document → Index external links of pages → Queue event "page.restored" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) → Add what the restore of this run left out to the result as `restore`; without a known content model the result stays as it is */
        post: operations["restorePageRevision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/publish-all/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission pages.manage → Re-render every pages → Write llms.txt (and llms-full.txt when `llms.full` is set) from the live output of every delivered type (adds `_llms: { entries, full }` to the result) → Write redirects.json to the blobstore (adds `redirects: { rules, skipped }` to the result) */
        post: operations["publishAllPages"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/publish-status/pages/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Publish status per locale of a pages */
        get: operations["pagePublishStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/broken": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Broken references */
        get: operations["brokenReferences"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/rebuild": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission pages.manage → Rebuild the reference index */
        post: operations["rebuildReferences"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/to/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Documents referencing each of up to 200 media ids */
        get: operations["mediaReferrersMany"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/to/media/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Documents referencing a media */
        get: operations["mediaReferrers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/to/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Documents referencing each of up to 200 pages ids */
        get: operations["pageReferrersMany"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/to/pages/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission pages.manage → Documents referencing a pages */
        get: operations["pageReferrers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/replication/points": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission system.manage → Restore points (snapshots and WAL segments) */
        get: operations["replicationPoints"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/replication/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission system.manage → Rebuild the database at a point in time next to the live file; applied on next start */
        post: operations["replicationRestore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/replication/snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission system.manage → Start a new generation with a full snapshot */
        post: operations["replicationSnapshot"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/replication/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission system.manage → Replication status */
        get: operations["replicationStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{id}/audit/anonymize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission users.manage → Strip the user in `params.id` or the event payload's `id` from every audit entry: their identity id and every param naming them go, the event and its time stay */
        post: operations["retryAnonymizeAuditUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users/{id}/revisions/reassign": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission users.manage → Replace the author of every revision written by the user in `params.id` or the event payload's `id`. A preceding step's `verifiedUser` (e.g. `authn.verifyUser`'s verified target) is used when present; without one, falls back to the unverified `reassignTo` from the payload or the event hand-over, a user id or `{ id }`. Without any target, the anonymous author `{ id: null, name: null }` */
        post: operations["retryReassignRevisionAuthor"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rate limit bucket login → Log in with credentials → Queue event "auth.loggedIn" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → End the current session → Queue event "auth.loggedOut" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Current identity */
        get: operations["me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Change own password */
        post: operations["changePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission media.read → List media, newest first → Add variants[] to a media item or list (result.id or result.items) */
        get: operations["listMedia"];
        put?: never;
        /** Require a valid session → Requires permission media.write → Sanitize uploaded SVG files (scripts, handlers, external references removed) → Upload one or more files (multipart field `file`, repeatable). A single file returns the item; multiple files return per-file results. Idempotent: same folder, same filename and same bytes return the item that is already there, and the step then ends the pipeline itself (200), so no following step – notably events.emit:media.uploaded – runs for an upload that stored nothing → Queue event "media.uploaded" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["uploadMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission media.read → Media metadata → Add variants[] to a media item or list (result.id or result.items) */
        get: operations["getMedia"];
        put?: never;
        post?: never;
        /** Require a valid session → Requires permission media.delete → Refuse deletion while media is referenced → Delete one media item's variants (blob + rows) → Delete file and metadata → Queue event "media.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deleteMedia"];
        options?: never;
        head?: never;
        /** Require a valid session → Requires permission media.write → Rename, move, set provenance or texts (alt/title/description per locale) → Queue event "media.updated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        patch: operations["updateMedia"];
        trace?: never;
    };
    "/media/{id}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission media.read → The file itself */
        get: operations["downloadMedia"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/{id}/variants/{file}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission media.read → Binary variant, or the original with x-kestrel-variant: pending while it isn't ready yet */
        get: operations["serveImageVariant"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/folders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission media.read → Folders (persistent and implied) with item counts */
        get: operations["listMediaFolders"];
        put?: never;
        /** Require a valid session → Requires permission media.write → Create a folder (idempotent: an existing folder is returned unchanged) */
        post: operations["createMediaFolder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/folders/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Require a valid session → Requires permission media.delete → Deprecated, use media.listFolderItems: Item ids in a folder, for use with references.guardAll:media before removeFolder → Refuse while any of result.ids of media is referenced → Delete variants for every id in result.ids (from media.folderItems) → Delete a folder and everything in it */
        delete: operations["deleteMediaFolder"];
        options?: never;
        head?: never;
        /** Require a valid session → Requires permission media.write → Rename or move a folder, moving its blobs */
        patch: operations["renameMediaFolder"];
        trace?: never;
    };
    "/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission pages.read → List pages */
        get: operations["listPages"];
        put?: never;
        /** Require a valid session → Requires permission pages.write → Validate payload field pages.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field pages.body → Validate payload field pages.body against its JSON Schema → Validate payload field pages.accent against its JSON Schema → Referenced ids of pages must exist → Create a pages → Record the saved pages document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a pages document → Index external links of pages → Queue event "page.created" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["createPage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pages/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission pages.read → One pages document */
        get: operations["readPage"];
        put?: never;
        post?: never;
        /** Require a valid session → Requires permission pages.delete → Refuse deletion while pages is referenced → Delete a pages → Drop every revision of a pages document, in every locale → Drop indexed references of a pages document → Drop indexed links of pages → Queue event "page.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deletePage"];
        options?: never;
        head?: never;
        /** Require a valid session → Requires permission pages.write → Validate payload field pages.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field pages.body → Validate payload field pages.body against its JSON Schema → Validate payload field pages.accent against its JSON Schema → Referenced ids of pages must exist → Update a pages → Record the saved pages document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a pages document → Index external links of pages → Queue event "page.updated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        patch: operations["updatePage"];
        trace?: never;
    };
    "/pages/{id}/translations/{locale}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Require a valid session → Requires permission pages.write → Remove one translation of a pages (locale from the route or ?locale=); the document stays in its other locales → Drop the revisions of one locale of a pages document → Index the references of a pages document → Index external links of pages → Queue event "page.translationRemoved" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deletePageTranslation"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/redirects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission redirects.read → One redirects document */
        get: operations["getRedirects"];
        /** Require a valid session → Requires permission redirects.write → Validate payload field redirects.rules against its JSON Schema → Compile the redirect rules of the payload; VALIDATION names the offending row → Replace the redirects document → Write redirects.json to the blobstore (adds `redirects: { rules, skipped }` to the result) */
        put: operations["setRedirects"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/redirects.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The compiled redirect list (same content as redirects.json) */
        get: operations["renderRedirects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission settings.read → One settings document → Replace internal kestrel:<type>:<id> references in the settings document with public paths (_links map added) */
        get: operations["getSettings"];
        /** Require a valid session → Requires permission settings.write → Validate payload field settings.navigation against its JSON Schema → Replace the settings document → Write llms.txt (and llms-full.txt when `llms.full` is set) from the live output of every delivered type (adds `_llms: { entries, full }` to the result) */
        put: operations["setSettings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/site/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present → Requires permission pages.read → Answer { redirect: { to, status } } and end the pipeline when the request path matches a rule → Resolve a site path to a pages document (default locale unprefixed) → Replace internal kestrel:<type>:<id> references in the pages document with public paths (_links map added) */
        get: operations["resolvePage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission users.manage → List users */
        get: operations["listUsers"];
        put?: never;
        /** Require a valid session → Requires permission users.manage → Create a user → Queue event "user.created" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["createUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session → Requires permission users.manage → One user */
        get: operations["getUser"];
        put?: never;
        post?: never;
        /** Require a valid session → Requires permission users.manage → Delete a user and their sessions for good; `reassignTo` names the active user their authored history moves to, without it the history is anonymised → Queue event "user.deleted?with=result" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deleteUser"];
        options?: never;
        head?: never;
        /** Require a valid session → Requires permission users.manage → Rename a user or set their roles (a role change ends their sessions) → Queue event "user.updated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        patch: operations["updateUser"];
        trace?: never;
    };
    "/users/{id}/activate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission users.manage → Activate a user */
        post: operations["activateUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/{id}/deactivate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session → Requires permission users.manage → Deactivate a user (ends their sessions) → Queue event "user.deactivated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["deactivateUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/{id}/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Require a valid session → Requires permission users.manage → Set a user's password (ends their sessions) */
        put: operations["setPassword"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            code: string;
            details?: {
                [key: string]: unknown;
            };
            error: string;
            retryable: boolean;
            /** Format: uuid */
            runId: string;
            step?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type SchemaError = components['schemas']['Error'];
export type $defs = Record<string, never>;
export interface operations {
    eventsDead: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            attempts: number;
                            availableAt: number;
                            createdAt: number;
                            error: string;
                            id: string;
                            name: string;
                            pipeline: string;
                            runId: string;
                        }[];
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    eventsRetryOne: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        retried: number;
                    };
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description no dead event with that id */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    eventsRetryDead: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        retried: number;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    eventsQueueStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        dead: number;
                        done24h: number;
                        oldestPendingAt: number | null;
                        pending: number;
                        running: number;
                        worker: {
                            lastTickAt: number | null;
                            running: boolean;
                        };
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    pruneImages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    sizes: string[];
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sizes: number;
                        variants: number;
                    };
                };
            };
            /** @description missing sizes, or a name is still declared or has no variants */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission images.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    retryFailedImages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id?: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        job: {
                            cursor: string;
                            done: number;
                            error: string | null;
                            failed: number;
                            finishedAt: number | null;
                            id: string;
                            startedAt: number;
                            /** @enum {string} */
                            state: "running" | "paused" | "done" | "error";
                            total: number;
                            updatedAt: number;
                        } | null;
                        media: number;
                        variants: number;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission images.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description media item not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description images are shutting down */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listImageSizes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        fit: "inside" | "cover";
                        /** @enum {string} */
                        format: "webp" | "original";
                        height?: number | null;
                        name: string;
                        quality: number;
                        /** @enum {string} */
                        source: "default" | "config" | "registered";
                        updatedAt: number;
                        width: number;
                    }[];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission images.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    registerImageSizes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    sizes: {
                        /** @enum {string} */
                        fit?: "inside" | "cover";
                        /** @enum {string} */
                        format?: "webp" | "original";
                        height?: number;
                        name: string;
                        quality?: number;
                        width: number;
                    }[];
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        fit: "inside" | "cover";
                        /** @enum {string} */
                        format: "webp" | "original";
                        height?: number | null;
                        name: string;
                        quality: number;
                        /** @enum {string} */
                        source: "default" | "config" | "registered";
                        updatedAt: number;
                        width: number;
                    }[];
                };
            };
            /** @description empty list or invalid size definition */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission images.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description a size collides with a config size */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    imagesStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        failed: {
                            recent: {
                                attempts: number;
                                error: string | null;
                                mediaId: string;
                                size: string;
                                updatedAt: number;
                            }[];
                            variants: number;
                        };
                        job: {
                            cursor: string;
                            done: number;
                            error: string | null;
                            failed: number;
                            finishedAt: number | null;
                            id: string;
                            startedAt: number;
                            /** @enum {string} */
                            state: "running" | "paused" | "done" | "error";
                            total: number;
                            updatedAt: number;
                        } | null;
                        orphaned: {
                            sizes: string[];
                            variants: number;
                        };
                        registrySeen: boolean;
                        sizes: {
                            /** @enum {string} */
                            fit: "inside" | "cover";
                            /** @enum {string} */
                            format: "webp" | "original";
                            height?: number | null;
                            name: string;
                            quality: number;
                            /** @enum {string} */
                            source: "default" | "config" | "registered";
                            updatedAt: number;
                            used: boolean;
                            variants: {
                                done: number;
                                error: number;
                                failed: number;
                                pending: number;
                            };
                            width: number;
                        }[];
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission images.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    syncImages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        cursor: string;
                        done: number;
                        error: string | null;
                        failed: number;
                        finishedAt: number | null;
                        id: string;
                        startedAt: number;
                        /** @enum {string} */
                        state: "running" | "paused" | "done" | "error";
                        total: number;
                        updatedAt: number;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission images.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description a fresh job is already running */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    insightsManifest: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        contracts: string[];
                        core: {
                            version: string;
                        };
                        generatedAt: number;
                        modules: {
                            atomicScope: boolean;
                            config: {
                                schema: Record<string, never>;
                                variables: {
                                    default?: unknown;
                                    path: string;
                                    /** @description The value is withheld: the schema marks the variable secret, its key name looks like a credential, or an ancestor is redacted */
                                    redacted: boolean;
                                    required: boolean;
                                    secret: boolean;
                                    set: boolean;
                                    /**
                                     * @description set: the raw config carries the path; default: it does not and the value comes from this node's or an ancestor's default; missing: no value at all
                                     * @enum {string}
                                     */
                                    status: "set" | "default" | "missing";
                                    type: string;
                                    /** @description The effective value as a JSON snapshot: what the config sets, else the default; null when the variable is missing or redacted */
                                    value: unknown;
                                }[];
                            };
                            emits: string[];
                            eventHook: boolean;
                            name: string;
                            optional: string[];
                            provides: string[];
                            requires: string[];
                            steps: string[];
                            use: string;
                            version: string | null;
                        }[];
                        pipelines: {
                            name: string;
                            steps: {
                                atomic?: number;
                                description: {
                                    binary?: boolean;
                                    errors?: {
                                        [key: string]: string;
                                    };
                                    extendsItems?: Record<string, never>;
                                    extendsOutput?: Record<string, never>;
                                    input?: Record<string, never>;
                                    multipart?: boolean;
                                    output?: Record<string, never>;
                                    query?: {
                                        [key: string]: Record<string, never>;
                                    };
                                    reads: string[];
                                    /** @enum {string} */
                                    security?: "required" | "optional";
                                    summary: string;
                                    writes: string[];
                                };
                                module: string;
                                name: string;
                                spec: string;
                            }[];
                        }[];
                        steps: {
                            description: {
                                binary?: boolean;
                                errors?: {
                                    [key: string]: string;
                                };
                                extendsItems?: Record<string, never>;
                                extendsOutput?: Record<string, never>;
                                input?: Record<string, never>;
                                multipart?: boolean;
                                output?: Record<string, never>;
                                query?: {
                                    [key: string]: Record<string, never>;
                                };
                                reads: string[];
                                /** @enum {string} */
                                security?: "required" | "optional";
                                summary: string;
                                writes: string[];
                            };
                            factory: boolean;
                            module: string;
                            name: string;
                        }[];
                        triggers: {
                            crons: {
                                expression: string;
                                pipeline: string;
                            }[];
                            events: {
                                event: string;
                                pipeline: string;
                            }[];
                            http: {
                                method: string;
                                path: string;
                                pipeline: string;
                            }[];
                        };
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission insights.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    insightsStats: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        events: {
                            count: number;
                            lastAt: number | null;
                            name: string;
                        }[];
                        generatedAt: number;
                        pipelines: {
                            count: number;
                            errors: number;
                            failed: number;
                            lastAt: number | null;
                            name: string;
                            p50Ms: number;
                            p95Ms: number;
                        }[];
                        process: {
                            pid: number;
                            startedAt: number;
                            uptimeMs: number;
                        };
                        ratelimit: {
                            key: string;
                            remaining: number;
                            resetAt: number;
                        }[];
                        recentFailures: {
                            at: number;
                            code?: string;
                            /** @description The failure text a client would see, truncated; never a stack */
                            message?: string;
                            ms: number;
                            pipeline: string;
                            runId: string;
                            status: number;
                            step?: string;
                            trigger: {
                                kind: string;
                                name: string;
                            };
                        }[];
                        runs: {
                            active: number;
                            errors: number;
                            failed: number;
                            total: number;
                        };
                        steps: {
                            count: number;
                            errors: number;
                            failed: number;
                            p50Ms: number;
                            p95Ms: number;
                            pipeline: string;
                            step: string;
                        }[];
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission insights.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    brokenLinks: {
        parameters: {
            query?: {
                type?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        checkedAt: number | null;
                        error: string | null;
                        field: string;
                        fromId: string;
                        fromType: string;
                        locale: string;
                        ok: boolean | null;
                        status: number | null;
                        url: string;
                    }[];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    rebuildLinks: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        documents: number;
                        entries: number;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    exportMedia: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        conflicts: number;
                        missing: number;
                        skipped: number;
                        variants: {
                            skipped: number;
                            written: number;
                        };
                        written: number;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    reconcileMediaReport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    delete?: boolean;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        blobsWithoutRow: string[];
                        rowsWithoutBlob: string[];
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    reconcileMediaDelete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        blobsWithoutRow: string[];
                        rowsWithoutBlob: string[];
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listMigrations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        applied: {
                            appliedAt: number;
                            documents: number;
                            durationMs: number;
                            id: string;
                        }[];
                        pending: {
                            collection: string;
                            id: string;
                        }[];
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission migrations.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    applyMigrations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    dry?: boolean;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        changes: {
                            documents: number;
                            id: string;
                        }[];
                        /** @constant */
                        dry: true;
                    } | {
                        applied: {
                            appliedAt: number;
                            documents: number;
                            durationMs: number;
                            id: string;
                        }[];
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission migrations.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description another apply() is already running */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description a migration failed (message names the migration, document and locale) */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listAllPages: {
        parameters: {
            query?: {
                limit?: number;
                locale?: "de" | "en";
                offset?: number;
                sort?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** @description origin locale per field, only with fallback */
                            _locales?: {
                                [key: string]: string;
                            };
                            /** @description per locale: required localized fields present */
                            _translations?: {
                                [key: string]: boolean;
                            };
                            accent?: string | null;
                            body?: unknown | null;
                            createdAt: number;
                            id: string;
                            layout?: string | null;
                            seo?: unknown | null;
                            shareImage?: string | null;
                            slug?: string | null;
                            status?: ("draft" | "finished" | "published") | null;
                            title?: string | null;
                            updatedAt: number;
                        }[];
                        total: number;
                    };
                };
            };
            /** @description invalid limit, offset, sort or locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    readAnyPage: {
        parameters: {
            query?: {
                locale?: "de" | "en";
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description unknown locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    pageRevisions: {
        parameters: {
            query?: {
                limit?: number;
                locale?: string;
                offset?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        head: string | null;
                        items: {
                            author: {
                                id: string | null;
                                name: string | null;
                            };
                            bytes: number;
                            collection: string;
                            createdAt: number;
                            documentId: string;
                            id: string;
                            /** @enum {string} */
                            kind: "save" | "restore";
                            label: string | null;
                            live: boolean;
                            locale: string;
                            parentId: string | null;
                            skipped: boolean;
                            status: string | null;
                        }[];
                        total: number;
                    };
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    pageRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revisionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        author: {
                            id: string | null;
                            name: string | null;
                        };
                        bytes: number;
                        collection: string;
                        createdAt: number;
                        documentId: string;
                        id: string;
                        /** @enum {string} */
                        kind: "save" | "restore";
                        label: string | null;
                        live: boolean;
                        locale: string;
                        parentId: string | null;
                        restore?: {
                            dropped: string[];
                            missing: string[];
                            revisionId: string;
                        };
                        skipped: boolean;
                        snapshot: Record<string, never> | null;
                        status: string | null;
                    };
                };
            };
            /** @description missing id or revisionId */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description no such revision */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    labelPageRevision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revisionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    label: string | null;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        author: {
                            id: string | null;
                            name: string | null;
                        };
                        bytes: number;
                        collection: string;
                        createdAt: number;
                        documentId: string;
                        id: string;
                        /** @enum {string} */
                        kind: "save" | "restore";
                        label: string | null;
                        live: boolean;
                        locale: string;
                        parentId: string | null;
                        skipped: boolean;
                        status: string | null;
                    };
                };
            };
            /** @description missing id or revisionId */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description no such revision */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    restorePageRevision: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path: {
                id: string;
                revisionId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    accent?: string | null;
                    body?: unknown | null;
                    layout?: string | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    seo?: unknown | null;
                    shareImage?: string | null;
                    slug?: string | null;
                    status?: ("draft" | "finished" | "published") | null;
                    title?: string | null;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        restore?: {
                            dropped: string[];
                            missing: string[];
                            revisionId: string;
                        };
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description validation failed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the revision carries no snapshot */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    publishAllPages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _llms: {
                            entries: number;
                            full: boolean;
                        };
                        documents: number;
                        errors: number;
                        live: number;
                        redirects: {
                            rules: number;
                            skipped: string[];
                        };
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    pagePublishStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        docId: string;
                        error?: string | null;
                        locale: string;
                        path?: string | null;
                        publishedAt?: number | null;
                        /** @enum {string} */
                        state: "live" | "error" | "draft";
                        type: string;
                        updatedAt: number;
                    }[];
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    brokenReferences: {
        parameters: {
            query?: {
                target?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        broken: boolean;
                        checkedAt: number | null;
                        field: string;
                        fromId: string;
                        fromType: string;
                        locale: string;
                        toId: string;
                        toTarget: string;
                        /** @enum {string} */
                        via: "field" | "body";
                    }[];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    rebuildReferences: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        documents: number;
                        entries: number;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    mediaReferrersMany: {
        parameters: {
            query?: {
                ids?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: {
                            field: string;
                            id: string;
                            type: string;
                            /** @enum {string} */
                            via: "field" | "body";
                        }[];
                    };
                };
            };
            /** @description missing ids or more than 200 ids */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    mediaReferrers: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        field: string;
                        id: string;
                        type: string;
                        /** @enum {string} */
                        via: "field" | "body";
                    }[];
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    pageReferrersMany: {
        parameters: {
            query?: {
                ids?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: {
                            field: string;
                            id: string;
                            type: string;
                            /** @enum {string} */
                            via: "field" | "body";
                        }[];
                    };
                };
            };
            /** @description missing ids or more than 200 ids */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    pageReferrers: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        field: string;
                        id: string;
                        type: string;
                        /** @enum {string} */
                        via: "field" | "body";
                    }[];
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    replicationPoints: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        at: number;
                        generation: string;
                        key: string;
                        /** @enum {string} */
                        kind: "snapshot" | "wal";
                    }[];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    replicationRestore: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description milliseconds or ISO-8601; default latest */
                    at?: number | string;
                    generation?: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        at: number;
                        file: string;
                        generation: string;
                        /** @enum {boolean} */
                        restartRequired: true;
                    };
                };
            };
            /** @description invalid "at" value */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description no snapshot before the requested point */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    replicationSnapshot: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        bytes: number;
                        generation: string;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    replicationStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        generation: string | null;
                        lastCheckpointAt: number | null;
                        lastSnapshotAt: number | null;
                        lastSyncAt: number | null;
                        lineage: number;
                        pendingRestore: string | null;
                        shippedFrames: number;
                        walBytes: number;
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission system.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    retryAnonymizeAuditUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        entries: number;
                    };
                };
            };
            /** @description no user id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    retryReassignRevisionAuthor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    reassignTo?: string | {
                        id: string;
                        name?: string;
                    } | null;
                } & {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        from: string;
                        revisions: number;
                        to: {
                            id: string;
                            name: string;
                        } | null;
                    };
                };
            };
            /** @description no user id, or an invalid `reassignTo` (the unverified fallback requires `{ id, name }` or null), or the former author again */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email?: string;
                    password: string;
                    username?: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        identity: {
                            claims: {
                                [key: string]: unknown;
                            };
                            id: string;
                        };
                        token: string;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description invalid credentials */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description too many requests */
            429: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        ok: boolean;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        claims: {
                            [key: string]: unknown;
                        };
                        id: string;
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    changePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    currentPassword: string;
                    newPassword: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
            /** @description wrong current password, missing fields, or new one too short */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listMedia: {
        parameters: {
            query?: {
                folder?: string;
                ids?: string;
                limit?: number;
                locale?: string;
                offset?: number;
                q?: string;
                recursive?: boolean;
                sort?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            alt: string | null;
                            /** @description sha256 of the uploaded bytes, hex; null for items uploaded before checksums were recorded */
                            checksum: string | null;
                            contentType: string;
                            createdAt: number;
                            description: string | null;
                            filename: string;
                            folder: string;
                            height: number | null;
                            id: string;
                            key: string;
                            /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                            provenance: {
                                at?: number;
                                model?: string;
                                /** @enum {string} */
                                origin: "human" | "ai" | "mixed" | "unknown";
                                tool?: string;
                            };
                            size: number;
                            /**
                             * @description only ready items are listed, readable and downloadable
                             * @enum {string}
                             */
                            status: "uploading" | "ready" | "failed";
                            title: string | null;
                            updatedAt: number;
                            variants: {
                                bytes: number;
                                format: string;
                                height: number;
                                path: string;
                                size: string;
                                /** @enum {string} */
                                state: "pending" | "done" | "error" | "failed";
                                width: number;
                            }[];
                            width: number | null;
                        }[];
                        total: number;
                    };
                };
            };
            /** @description invalid folder or unknown locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    uploadMedia: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file: string;
                    folder?: string;
                    /** @description origin (human|ai|mixed|unknown) or JSON of the provenance object, applied to every file; omitted means unknown */
                    provenance?: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                    };
                };
            };
            /** @description no file or invalid folder/provenance (per-file for a multi-file request) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description filename already exists in that folder with different bytes, `details.field: "key"` (per-file for a multi-file request); the same bytes again are idempotent, not a conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description file exceeds maxBytes (per-file for a multi-file request) */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description type not allowed (per-file for a multi-file request) */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getMedia: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        alt: string | null;
                        /** @description sha256 of the uploaded bytes, hex; null for items uploaded before checksums were recorded */
                        checksum: string | null;
                        contentType: string;
                        createdAt: number;
                        description: string | null;
                        filename: string;
                        folder: string;
                        height: number | null;
                        id: string;
                        key: string;
                        /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                        provenance: {
                            at?: number;
                            model?: string;
                            /** @enum {string} */
                            origin: "human" | "ai" | "mixed" | "unknown";
                            tool?: string;
                        };
                        size: number;
                        /**
                         * @description only ready items are listed, readable and downloadable
                         * @enum {string}
                         */
                        status: "uploading" | "ready" | "failed";
                        title: string | null;
                        updatedAt: number;
                        variants: {
                            bytes: number;
                            format: string;
                            height: number;
                            path: string;
                            size: string;
                            /** @enum {string} */
                            state: "pending" | "done" | "error" | "failed";
                            width: number;
                        }[];
                        width: number | null;
                    };
                };
            };
            /** @description unknown locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    deleteMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        ok: boolean;
                    };
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.delete */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description still referenced */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    updateMedia: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    alt?: string | null;
                    description?: string | null;
                    filename?: string;
                    folder?: string;
                    locale?: string;
                    /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                    provenance?: {
                        at?: number;
                        model?: string;
                        /** @enum {string} */
                        origin: "human" | "ai" | "mixed" | "unknown";
                        tool?: string;
                    };
                    title?: string | null;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        alt: string | null;
                        /** @description sha256 of the uploaded bytes, hex; null for items uploaded before checksums were recorded */
                        checksum: string | null;
                        contentType: string;
                        createdAt: number;
                        description: string | null;
                        filename: string;
                        folder: string;
                        height: number | null;
                        id: string;
                        key: string;
                        /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                        provenance: {
                            at?: number;
                            model?: string;
                            /** @enum {string} */
                            origin: "human" | "ai" | "mixed" | "unknown";
                            tool?: string;
                        };
                        size: number;
                        /**
                         * @description only ready items are listed, readable and downloadable
                         * @enum {string}
                         */
                        status: "uploading" | "ready" | "failed";
                        title: string | null;
                        updatedAt: number;
                        width: number | null;
                    };
                };
            };
            /** @description invalid name, folder or text (texts are plain text, max 2000 chars) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description filename already exists in that folder */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    downloadMedia: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description the file */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": string;
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    serveImageVariant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description the file */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "*/*": string;
                };
            };
            /** @description missing id or file */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description media item or size not found, or the variant gave up after maxAttempts */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listMediaFolders: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        count: number;
                        folder: string;
                    }[];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    createMediaFolder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    path: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        count: number;
                        folder: string;
                    };
                };
            };
            /** @description missing or invalid path */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    deleteMediaFolder: {
        parameters: {
            query?: {
                recursive?: boolean;
            };
            header?: never;
            path: {
                /** @description rest of the path, may contain slashes */
                path: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                        removed: number;
                    };
                };
            };
            /** @description invalid path */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.delete */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description folder not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description folder not empty or still referenced */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    renameMediaFolder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description rest of the path, may contain slashes */
                path: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    path: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        folder: string;
                        moved: number;
                    };
                };
            };
            /** @description missing or invalid path */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission media.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description folder not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description target folder already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listPages: {
        parameters: {
            query?: {
                limit?: number;
                locale?: "de" | "en";
                offset?: number;
                sort?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            /** @description origin locale per field, only with fallback */
                            _locales?: {
                                [key: string]: string;
                            };
                            /** @description per locale: required localized fields present */
                            _translations?: {
                                [key: string]: boolean;
                            };
                            accent?: string | null;
                            body?: unknown | null;
                            createdAt: number;
                            id: string;
                            layout?: string | null;
                            seo?: unknown | null;
                            shareImage?: string | null;
                            slug?: string | null;
                            status?: ("draft" | "finished" | "published") | null;
                            title?: string | null;
                            updatedAt: number;
                        }[];
                        total: number;
                    };
                };
            };
            /** @description invalid limit, offset, sort or locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    createPage: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    accent?: string | null;
                    body?: unknown | null;
                    layout?: string | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    seo?: unknown | null;
                    shareImage?: string | null;
                    slug: string;
                    /** @enum {string} */
                    status: "draft" | "finished" | "published";
                    title: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description validation failed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description a document with that id already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    readPage: {
        parameters: {
            query?: {
                locale?: "de" | "en";
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description unknown locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    deletePage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        ok: boolean;
                    };
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.delete */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description still referenced */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    updatePage: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    accent?: string | null;
                    body?: unknown | null;
                    layout?: string | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    seo?: unknown | null;
                    shareImage?: string | null;
                    slug?: string | null;
                    status?: ("draft" | "finished" | "published") | null;
                    title?: string | null;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description validation failed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    deletePageTranslation: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path: {
                id: string;
                locale: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description missing id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description document or translation not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description last translation – remove the document */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getRedirects: {
        parameters: {
            query?: {
                locale?: "de" | "en";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        createdAt: number;
                        id: string;
                        rules?: unknown | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description unknown locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission redirects.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    setRedirects: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    locale?: "de" | "en";
                    rules?: unknown | null;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        createdAt: number;
                        id: string;
                        redirects: {
                            rules: number;
                            skipped: string[];
                        };
                        rules?: unknown | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description validation failed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission redirects.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    renderRedirects: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        pattern: string;
                        /** @enum {integer} */
                        status: 301 | 302 | 307 | 308;
                        target: string;
                    }[];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getSettings: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description internal references by target id after site.resolveLinks; absent when the document has no internal references to resolve */
                        _links?: {
                            [key: string]: {
                                broken?: boolean;
                                locale?: string;
                                path?: string;
                            };
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        createdAt: number;
                        description?: string | null;
                        id: string;
                        navigation?: unknown | null;
                        title?: string | null;
                        titlePosition?: ("suffix" | "prefix") | null;
                        titleSeparator?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description unknown locale */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission settings.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    setSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    description?: string | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    navigation?: unknown | null;
                    title: string;
                    titlePosition?: ("suffix" | "prefix") | null;
                    titleSeparator?: string | null;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _llms: {
                            entries: number;
                            full: boolean;
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        createdAt: number;
                        description?: string | null;
                        id: string;
                        navigation?: unknown | null;
                        title?: string | null;
                        titlePosition?: ("suffix" | "prefix") | null;
                        titleSeparator?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description validation failed */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission settings.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    resolvePage: {
        parameters: {
            query?: {
                locale?: string;
            };
            header?: never;
            path: {
                /** @description rest of the path, may contain slashes */
                path: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description internal references by target id after site.resolveLinks; absent when the document has no internal references to resolve */
                        _links?: {
                            [key: string]: {
                                broken?: boolean;
                                locale?: string;
                                path?: string;
                            };
                        };
                        /** @description effective locale of a site-resolved document */
                        _locale?: string;
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission pages.read */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description no page at this path */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listUsers: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        active: boolean;
                        createdAt: number;
                        id: string;
                        roles: string[];
                        username: string;
                    }[];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    createUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                    roles?: string[];
                    username: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        active: boolean;
                        createdAt: number;
                        id: string;
                        roles: string[];
                        username: string;
                    };
                };
            };
            /** @description invalid input */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description username already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    getUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        active: boolean;
                        createdAt: number;
                        id: string;
                        roles: string[];
                        username: string;
                    };
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description user not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    deleteUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    reassignTo?: string | null;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        ok: boolean;
                        reassignTo: {
                            id: string;
                            name: string;
                        } | null;
                    };
                };
            };
            /** @description cannot delete yourself, or a `reassignTo` that is the deleted user, inactive or not a user id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description user not found, or `reassignTo` names no user */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the last active admin cannot be deleted (`LAST_ADMIN`) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    updateUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    roles?: string[];
                    username?: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        active: boolean;
                        createdAt: number;
                        id: string;
                        roles: string[];
                        username: string;
                    };
                };
            };
            /** @description neither username nor roles given, or an empty one */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description user not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description username already exists (`CONFLICT`), or the last active admin would lose the admin permission (`LAST_ADMIN`) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    activateUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
            /** @description invalid body */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description user not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    deactivateUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending";
                        };
                        ok: boolean;
                    };
                };
            };
            /** @description cannot deactivate yourself */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description user not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the last active admin cannot be deactivated (`LAST_ADMIN`) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the event could not be persisted */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    setPassword: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                };
            };
        };
        responses: {
            /** @description ok */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
            /** @description password missing or too short */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description missing permission users.manage */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description user not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description temporarily unavailable; retry after the Retry-After header */
            503: {
                headers: {
                    /** @description seconds until the client may retry */
                    "Retry-After"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
}
