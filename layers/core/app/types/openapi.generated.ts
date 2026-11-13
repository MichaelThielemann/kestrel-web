// This file is generated. Do not edit by hand.
// Regenerate with `pnpm generate:api-types`.

export interface paths {
    "/admin/blog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → List blog → Add _paths (locale → path) to the blog result, every valid path including drafts */
        get: operations["listAllBlog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/blog/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → One blog document → Add _paths (locale → path) to the blog result, every valid path including drafts */
        get: operations["readAnyBlog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/blog/{id}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → Revisions of one blog document and locale, newest first and without snapshots */
        get: operations["blogRevisions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/blog/{id}/revisions/{revisionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → One revision of a blog document including its snapshot and, where the content model is known, the dry run of its restore under `restore` */
        get: operations["blogRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.write → Name a blog revision, or clear its name with null; a labelled revision is never pruned */
        patch: operations["labelBlogRevision"];
        trace?: never;
    };
    "/admin/blog/{id}/revisions/{revisionId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.write → Put a blog revision's snapshot into the body, so the steps behind it save it like any other write and branch the history at that revision; fields the model has dropped since are left out → Validate payload field blog.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field blog.body → Validate payload field blog.body against its JSON Schema → Referenced ids of blog must exist → Update a blog → Record the saved blog document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a blog document → Index external links of blog → Queue event "blog.restored" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved blog (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) → Add what the restore of this run left out to the result as `restore`; without a known content model the result stays as it is */
        post: operations["restoreBlogRevision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/blog/path-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.write → The public path a blog would get for payload { id?, locale?, slug, parent? }, whether it would be reachable and why not; writes nothing */
        post: operations["previewBlogPath"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/dead": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Dead-letter events, most recently failed first */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Requeue the dead-letter event named by params.id */
        post: operations["eventsRetryOne"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/events/delivery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Dead-letter rows of the queue across every process: deliveries that used up maxAttempts and wait for events.retryDead */
        get: operations["eventsDeliveryStatus"];
        put?: never;
        post?: never;
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Requeue every dead-letter event */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Queue counters per state, the oldest pending event, the worker state of this process, and pending/running/oldestPendingAt per configured lane */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission images.manage → Retire the variants of sizes that are no longer declared: their paths keep answering with the original's bytes until the item is deleted */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission images.manage → Put every variant that gave up after maxAttempts back to pending with a fresh attempt budget – all of them, or one media item's (id from params.id or payload.id) – and start the work that regenerates them */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission images.read → Effective sizes (defaults/config merged with the sizes registered in this process) */
        get: operations["listImageSizes"];
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission images.write → Replace the sizes registered by this instance – code-declared sizes are held in memory, never stored */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission images.read → Sizes with usage/variant counts, current job, the variants that gave up with their last error, and sizes whose variants are left over from a size the code no longer declares */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission images.manage → Start a sync job, or resume a paused/error/stale one */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission insights.read → The static manifest of this instance: modules, contracts, config schemas, steps, pipelines, triggers and boot warnings */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission insights.read → Live counters of this process: runs, pipelines, steps, events, and the most recent failed runs */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Broken links */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Rebuild the link index */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.manage → Copy every ready media item to /var/lib/kestrel/export/<folder>/<filename> → Copy every done variant of a ready, not hidden media item to /var/lib/kestrel/export/<folder>/<filename>.<size>.<ext> */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.manage → Compare the blobs under the media prefix with the media_items rows; with `delete` also removes blobs that no row points at (rows are never deleted) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.manage → Like media.reconcile, but always deletes the orphan blobs – the deletion is in the pipeline, not in the request */
        post: operations["reconcileMediaDelete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/media/repair-public": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.manage → Reconcile the public copies of every ready item's original with the stored items: fail abandoned uploads, finish interrupted deletes, write missing or mismatched copies, and remove copies of failed, trashed or deleted items and foreign files, re-reading an item before its copy goes (adds _publicMedia: { written, removed, missing } to the result) → Reconcile the public copies of every ready item's variants and retired paths with the stored rows: place missing sizes, write missing or mismatched copies, and remove copies of deleted or hidden items and foreign files (adds _publicVariants: { written, removed, planned, missing } to the result) */
        post: operations["repairPublicMedia"];
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission migrations.manage → Applied migrations (ledger, oldest first) and still-pending migrations (config order) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission migrations.manage → Apply every pending migration; payload.dry === true reports the changes without writing */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → List pages → Add _paths (locale → path) to the pages result, every valid path including drafts */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → One pages document → Add _paths (locale → path) to the pages result, every valid path including drafts */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Revisions of one pages document and locale, newest first and without snapshots */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → One revision of a pages document including its snapshot and, where the content model is known, the dry run of its restore under `restore` */
        get: operations["pageRevision"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.write → Name a pages revision, or clear its name with null; a labelled revision is never pruned */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.write → Put a pages revision's snapshot into the body, so the steps behind it save it like any other write and branch the history at that revision; fields the model has dropped since are left out → Validate payload field pages.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field pages.body → Validate payload field pages.body against its JSON Schema → Validate payload field pages.accent against its JSON Schema → Referenced ids of pages must exist → Update a pages → Record the saved pages document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a pages document → Index external links of pages → Queue event "page.restored" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved pages (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) → Add what the restore of this run left out to the result as `restore`; without a known content model the result stays as it is */
        post: operations["restorePageRevision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/pages/path-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.write → The public path a pages would get for payload { id?, locale?, slug, parent? }, whether it would be reachable and why not; writes nothing */
        post: operations["previewPagePath"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/pages/tree": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Every pages with its parent, label, valid paths and live state per locale */
        get: operations["pageTree"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/paths/rebuild": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Recompute every routed document's paths from content@1 outside any group (adds `rebuild` to the result) → Write the planned paths inside one atomic group; saves committed since the plan are recomputed there → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run */
        post: operations["rebuildPaths"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/publish-all/blog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → Mark every blog output for a re-render in the background, including documents that were never delivered (adds `marked` to the result) */
        post: operations["publishAllBlog"];
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Mark every pages output for a re-render in the background, including documents that were never delivered (adds `marked` to the result) → Write redirects.json to the blobstore: editor rules first, then automatic ones (adds `redirects: { rules, skipped }` to the result) */
        post: operations["publishAllPages"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/publish-stale/pages/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Reset the attempts of every output whose re-render failed maxAttempts times and start it again (adds `retried` to the result) */
        post: operations["retryStalePages"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/publish-status/blog/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → Publish status per locale of a blog */
        get: operations["blogPublishStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/publish-status/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → How many outputs wait for a re-render, failed it, are rendering or have unknown dependencies, the oldest mark, and the renders this process abandoned at the timeout */
        get: operations["pagesStaleStatus"];
        put?: never;
        post?: never;
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Publish status per locale of a pages */
        get: operations["pagePublishStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/redirects/auto": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission redirects.read → Effective automatic redirects (a moved document's old path, sorted by from) */
        get: operations["listAutoRedirects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/redirects/auto/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission redirects.write → Turn the automatic redirect at params.path into a removed tombstone; a replay of the move that created it cannot restore it → Write redirects.json to the blobstore: editor rules first, then automatic ones (adds `redirects: { rules, skipped }` to the result) */
        delete: operations["removeAutoRedirect"];
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Broken references */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Rebuild the reference index */
        post: operations["rebuildReferences"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/to/blog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → Documents referencing each of up to 200 blog ids */
        get: operations["blogReferrersMany"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/references/to/blog/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.manage → Documents referencing a blog */
        get: operations["blogReferrers"];
        put?: never;
        post?: never;
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Documents referencing each of up to 200 media ids */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Documents referencing a media */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Documents referencing each of up to 200 pages ids */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.manage → Documents referencing a pages */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Restore points (snapshots and WAL segments) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Rebuild the database at a point in time next to the live file; applied on next start */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Start a new generation with a full snapshot */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission system.manage → Replication status */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Strip the user in `params.id` or the event payload's `id` from every audit entry: their identity id and every param naming them go, the event and its time stay */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Verify the user reference at payload.reassignTo: it must be a user id, { id }, or null. Writes its canonical { id, name } to verifiedUser, or null when there was none to verify. authn.verifyUser:reassignTo reads payload.reassignTo; authn.verifyUser:result.reassignTo reads payload.result.reassignTo, the shape an event hands over → Replace the author of every revision written by the user in `params.id` or the event payload's `id`, with the canonical `{ id, name }` a preceding step's `verifiedUser` (e.g. `authn.verifyUser`) verified. Without a target, the anonymous author `{ id: null, name: null }` */
        post: operations["retryReassignRevisionAuthor"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission blog.read → List blog → Add _paths (locale → path) to the blog result, reachable paths only → Keep only the blog fields the caller may see: anonymousFields.blog without an identity or a configured role; otherwise everything when one of its roles has no field grant for blog, else the union of its roles' grants and the anonymous one */
        get: operations["listBlog"];
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.write → Validate payload field blog.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field blog.body → Validate payload field blog.body against its JSON Schema → Referenced ids of blog must exist → Create a blog → Record the saved blog document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a blog document → Index external links of blog → Queue event "blog.created" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved blog (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["createBlog"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blog/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission blog.read → One blog document → Add _paths (locale → path) to the blog result, reachable paths only → Keep only the blog fields the caller may see: anonymousFields.blog without an identity or a configured role; otherwise everything when one of its roles has no field grant for blog, else the union of its roles' grants and the anonymous one */
        get: operations["readBlog"];
        put?: never;
        post?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.delete → Refuse deletion while blog is referenced → Delete a blog → Drop every revision of a blog document, in every locale → Drop indexed references of a blog document → Drop indexed links of blog → Queue event "blog.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved blog (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deleteBlog"];
        options?: never;
        head?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.write → Validate payload field blog.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field blog.body → Validate payload field blog.body against its JSON Schema → Referenced ids of blog must exist → Update a blog → Record the saved blog document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a blog document → Index external links of blog → Queue event "blog.updated" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved blog (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        patch: operations["updateBlog"];
        trace?: never;
    };
    "/blog/{id}/translations/{locale}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission blog.write → Remove one translation of a blog (locale from the route or ?locale=); the document stays in its other locales → Drop the revisions of one locale of a blog document → Index the references of a blog document → Index external links of blog → Queue event "blog.translationRemoved" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved blog (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deleteBlogTranslation"];
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
        /** Rate limit bucket login, counted by client address → Rate limit bucket loginAccount, counted by username; a device with a valid device cookie for the account is counted in its own budget instead → Log in with credentials; the token comes back in the body and in an HttpOnly session cookie → After authn.login: check the second factor with payload.code (a time-based or a recovery code). A refusal ends the session the login opened; a code that confirms a new factor adds result.recoveryCodes, shown once. From a known device, wrong codes neither count towards nor wait for the factor's lock → After a successful sign-in: hand the device a signed device cookie bound to the exact name of the signed-in account, when the body field bucket loginAccount reads names it, so the device's next sign-ins to that account count against its own budget → Queue event "auth.loggedIn" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/login/second-factor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rate limit bucket login, counted by client address → Rate limit bucket loginAccount, counted by username; a device with a valid device cookie for the account is counted in its own budget instead → Check the password through authn@1 and start setting up a second factor: answers the new secret and its otpauth URI to the caller it identified; the next login with a code for it confirms it */
        post: operations["setupSecondFactor"];
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → End the current session and remove the session cookie → Queue event "auth.loggedOut" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Current identity */
        get: operations["me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me/confirm-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Rate limit bucket passwordCheck, counted by identity → Confirm the caller's password; marks the session as freshly authenticated for authn.requireRecentAuth */
        post: operations["confirmPassword"];
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Rate limit bucket passwordCheck, counted by identity → Change own password → Queue event "user.passwordChanged" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission media.read → List media, newest first; anonymous callers may only fetch by ids → Add available, variants[] and variantCounts to a media item or list (result.id or result.items); a variant whose path has no object yet is never listed, and a hidden item lists no variants and is not available → Keep only the media fields the caller may see: anonymousFields.media without an identity or a configured role; otherwise everything when one of its roles has no field grant for media, else the union of its roles' grants and the anonymous one */
        get: operations["listMedia"];
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.write → Sanitize uploaded SVG files, also SVG content declared as another image type (scripts, handlers, external references removed) → Upload one or more files (multipart field `file`, repeatable). A single file returns the item; multiple files return per-file results. Idempotent: same folder, same filename and same bytes return the item that is already there, and the step then ends the pipeline itself (200), so no following step – notably events.emit:media.uploaded – runs for an upload that stored nothing → Queue event "media.uploaded" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission media.read → Media metadata → Add available, variants[] and variantCounts to a media item or list (result.id or result.items); a variant whose path has no object yet is never listed, and a hidden item lists no variants and is not available → Keep only the media fields the caller may see: anonymousFields.media without an identity or a configured role; otherwise everything when one of its roles has no field grant for media, else the union of its roles' grants and the anonymous one */
        get: operations["getMedia"];
        put?: never;
        post?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.delete → Refuse deletion while media is referenced → Delete file and metadata: end the item's readiness, then remove copy, blob and row, then a final sweep → Delete one media item's variants and retired paths (blob + rows) → Queue event "media.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deleteMedia"];
        options?: never;
        head?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.write → Rename, move, set provenance or texts (alt/title/description per locale); the file's key and path never change → Queue event "media.updated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        patch: operations["updateMedia"];
        trace?: never;
    };
    "/media/{id}/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission media.read → The file at its public URL (params.id, params.name); the name must be the one it was uploaded under → Keep only the mediaFile fields the caller may see: anonymousFields.mediaFile without an identity or a configured role; otherwise everything when one of its roles has no field grant for mediaFile, else the union of its roles' grants and the anonymous one */
        get: operations["serveMediaFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/{id}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission media.read → The file itself → Keep only the mediaFile fields the caller may see: anonymousFields.mediaFile without an identity or a configured role; otherwise everything when one of its roles has no field grant for mediaFile, else the union of its roles' grants and the anonymous one */
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
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission media.read → The variant at its public URL (params.id, params.file), or the original's bytes when no render is at that path yet; x-kestrel-variant: original marks the fallback → Keep only the mediaFile fields the caller may see: anonymousFields.mediaFile without an identity or a configured role; otherwise everything when one of its roles has no field grant for mediaFile, else the union of its roles' grants and the anonymous one */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.list → Folders (persistent and implied) with item counts; anonymous callers are refused */
        get: operations["listMediaFolders"];
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.write → Create a folder (idempotent: an existing folder is returned unchanged) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.delete → Item ids in a folder, for use with references.guardAll:media before removeFolder → Refuse while any of result.ids of media is referenced → Delete a folder and everything in it (each item as media.remove) → Delete variants for every id in result.ids (from media.listFolderItems, media.removeFolder or media.purge) → Queue event "media.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deleteMediaFolder"];
        options?: never;
        head?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.write → Rename or move a folder (metadata only: keys and paths do not change) */
        patch: operations["renameMediaFolder"];
        trace?: never;
    };
    "/media/trash": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.write → The trashed items, most recently trashed first, with trashedAt and expiresAt and no public path */
        get: operations["listMediaTrash"];
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.delete → Move the items in body.ids to the trash: the library no longer shows them, their names are free and their public copies are removed, while media@1 still reads them as ready until media.purge; per-id answer: result.ids holds every id that is trashed afterwards, an already trashed one also in result.unchanged (its public copy is removed again), an unknown one is skipped → Hide the variants of every id in result.ids (from media.trash or media.trashFolder): their public copies are removed and their paths are neither served, exported nor copied again until images.showMany, while rows and stored variants stay; raises no images.variantsChanged; with result.trashVersions (from the same steps), an id whose variants a later move already showed is left alone → Queue event "media.trashed" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["trashMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/trash/empty": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.delete → Select every trashed item into result.ids for media.purge → Keep only the media ids in result.ids that nothing references and add each referenced one to result.skipped as { id, reason: "referenced" }, so a following delete leaves it alone → Delete trashed items for good, each as media.remove: the ids in result.ids when an earlier step selected them (its result.skipped is kept), otherwise body.ids (at most 200); an item whose purge stopped halfway is finished, any other id that is not trashed is skipped → Delete variants for every id in result.ids (from media.listFolderItems, media.removeFolder or media.purge) → Queue event "media.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["emptyMediaTrash"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/trash/folders/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.delete → Move every ready item in a folder's subtree to the trash, delete its failed and abandoned uploads, and drop the folder rows of that subtree; an upload still under way keeps its folder listed; media.restore recreates the folders of the items it restores; result.ids also holds the items of the subtree already in the trash, named in result.unchanged, so a repeated request reaches them again after the folder is gone → Hide the variants of every id in result.ids (from media.trash or media.trashFolder): their public copies are removed and their paths are neither served, exported nor copied again until images.showMany, while rows and stored variants stay; raises no images.variantsChanged; with result.trashVersions (from the same steps), an id whose variants a later move already showed is left alone → Queue event "media.trashed" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["trashMediaFolder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/trash/purge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.delete → Select the trashed items among body.ids, and those whose purge stopped halfway, into result.ids for media.purge, reporting the others in result.skipped → Keep only the media ids in result.ids that nothing references and add each referenced one to result.skipped as { id, reason: "referenced" }, so a following delete leaves it alone → Delete trashed items for good, each as media.remove: the ids in result.ids when an earlier step selected them (its result.skipped is kept), otherwise body.ids (at most 200); an item whose purge stopped halfway is finished, any other id that is not trashed is skipped → Delete variants for every id in result.ids (from media.listFolderItems, media.removeFolder or media.purge) → Queue event "media.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["purgeMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/trash/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission media.write → Bring the trashed items in body.ids back with the same id, key, path, folder and texts; a display name taken meanwhile becomes <stem>-<n>.<ext> (listed in renamed); per-id answer: result.ids holds every id that is ready afterwards, an already ready one also in result.unchanged (its public copy is ensured), an unknown one is skipped → Show the variants of every id in result.ids again (from media.restore) and write their public copies; raises no images.variantsChanged; with result.trashVersions, an id whose variants a later move already hid stays hidden → Queue event "media.restored" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        post: operations["restoreMedia"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission pages.read → List pages → Add _paths (locale → path) to the pages result, reachable paths only → Keep only the pages fields the caller may see: anonymousFields.pages without an identity or a configured role; otherwise everything when one of its roles has no field grant for pages, else the union of its roles' grants and the anonymous one */
        get: operations["listPages"];
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.write → Validate payload field pages.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field pages.body → Validate payload field pages.body against its JSON Schema → Validate payload field pages.accent against its JSON Schema → Referenced ids of pages must exist → Create a pages → Record the saved pages document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a pages document → Index external links of pages → Queue event "page.created" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved pages (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission pages.read → One pages document → Add _paths (locale → path) to the pages result, reachable paths only → Keep only the pages fields the caller may see: anonymousFields.pages without an identity or a configured role; otherwise everything when one of its roles has no field grant for pages, else the union of its roles' grants and the anonymous one */
        get: operations["readPage"];
        put?: never;
        post?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.delete → Refuse deletion while pages is referenced → Delete a pages → Drop every revision of a pages document, in every locale → Drop indexed references of a pages document → Drop indexed links of pages → Queue event "page.deleted" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved pages (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deletePage"];
        options?: never;
        head?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.write → Validate payload field pages.body against its JSON Schema → Sanitize HTML at format:"html" positions of payload field pages.body → Validate payload field pages.body against its JSON Schema → Validate payload field pages.accent against its JSON Schema → Referenced ids of pages must exist → Update a pages → Record the saved pages document from the result as a revision; its parent is the head, or the revision a restore put on the context → Index the references of a pages document → Index external links of pages → Queue event "page.updated" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved pages (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission pages.write → Remove one translation of a pages (locale from the route or ?locale=); the document stays in its other locales → Drop the revisions of one locale of a pages document → Index the references of a pages document → Index external links of pages → Queue event "page.translationRemoved" for the subscribed handler pipelines; the worker delivers it after this run → Recompute the public paths of the saved pages (result.id, else params.id) and of every document whose path depends on it; last step of the write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission redirects.read → One redirects document → Keep only the redirects fields the caller may see: anonymousFields.redirects without an identity or a configured role; otherwise everything when one of its roles has no field grant for redirects, else the union of its roles' grants and the anonymous one */
        get: operations["getRedirects"];
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission redirects.write → Validate payload field redirects.rules against its JSON Schema → Compile the redirect rules of the payload; VALIDATION names the offending row, also for a rule that redirects into an active automatic redirect → Replace the redirects document → Index the references of a redirects document → Write redirects.json to the blobstore: editor rules first, then automatic ones (adds `redirects: { rules, skipped }` to the result) */
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
        /** The compiled redirect list (same content as redirects.json) → Keep only the redirectRules fields the caller may see: anonymousFields.redirectRules without an identity or a configured role; otherwise everything when one of its roles has no field grant for redirectRules, else the union of its roles' grants and the anonymous one */
        get: operations["renderRedirects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/routes/blog/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission blog.read → Resolve a site path to a blog document (default locale unprefixed) → Replace internal kestrel:<type>:<id> references in the blog document with public paths (_links map added) → Keep only the blog fields the caller may see: anonymousFields.blog without an identity or a configured role; otherwise everything when one of its roles has no field grant for blog, else the union of its roles' grants and the anonymous one */
        get: operations["resolveBlog"];
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
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission settings.read → One settings document → Replace internal kestrel:<type>:<id> references in the settings document with public paths (_links map added) → Keep only the settings fields the caller may see: anonymousFields.settings without an identity or a configured role; otherwise everything when one of its roles has no field grant for settings, else the union of its roles' grants and the anonymous one */
        get: operations["getSettings"];
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission settings.write → Validate payload field settings.navigation against its JSON Schema → Validate payload field settings.mounts against its JSON Schema → Replace the settings document → Queue event "settings.updated" for the subscribed handler pipelines; the worker delivers it after this run → Validate the stored mount assignment and move every document of each collection whose mount page changed; last step of the settings write's atomic group → After the write's atomic group: patches the in-memory path table from the committed rows and raises site.pathsMoved; never fails the run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) → Index the references of a settings document */
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
        /** Identify the caller if a valid token is present; a state-changing request authenticated by the session cookie must come from the same origin → Requires permission pages.read → End the pipeline with { redirect: { to, status } } on an editor rule or an automatic redirect (a moved document's old path); pass through otherwise → End the run with { route: { type } } when params.path is reachable and belongs to a routed collection other than pages; pass through otherwise → Resolve a site path to a pages document (default locale unprefixed) → Replace internal kestrel:<type>:<id> references in the pages document with public paths (_links map added) → Keep only the pages fields the caller may see: anonymousFields.pages without an identity or a configured role; otherwise everything when one of its roles has no field grant for pages, else the union of its roles' grants and the anonymous one */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → List users */
        get: operations["listUsers"];
        put?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Validate the role names at payload.roles against the configured roles; an absent value passes. authz.validateRoles:roles reads payload.roles, the shape authn.createUser and authn.updateUser accept → Create a user → Queue event "user.created" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → One user */
        get: operations["getUser"];
        put?: never;
        post?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Delete a user and their sessions for good; `reassignTo` names the active user their authored history moves to, without it the history is anonymised → Queue event "user.deleted?with=result" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["deleteUser"];
        options?: never;
        head?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Validate the role names at payload.roles against the configured roles; an absent value passes. authz.validateRoles:roles reads payload.roles, the shape authn.createUser and authn.updateUser accept → Rename a user or set their roles (a role change ends their sessions) → Queue event "user.updated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Activate a user → Queue event "user.activated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Deactivate a user (ends their sessions) → Queue event "user.deactivated" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
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
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → Set another user's password (ends their sessions); one's own password changes only through changePassword → Queue event "user.passwordSet" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        put: operations["setPassword"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/{id}/second-factor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → Require that the session's password was checked within the last 300 seconds, at login or through authn.confirmPassword; otherwise 403 REAUTH_REQUIRED → End every session of the user in params.id, e.g. after its second factor was reset → Remove another user's second factor and answer the one-time enrollment code its owner needs to set up a new one; run it after a step that ends that user's sessions → Queue event "user.secondFactorReset" for the subscribed handler pipelines; the worker delivers it after this run → Deliver the events this run queued, before the response; whatever is left over stays for the worker (adds `_events` to the result) */
        delete: operations["resetSecondFactor"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/users/second-factor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Require a valid session; a state-changing request authenticated by the session cookie must come from the same origin → Requires a signed-in caller holding at least one configured role; an account without one may only run the pipelines rolelessPipelines names → Requires permission users.manage → The ids of the users with a confirmed second factor */
        get: operations["secondFactorUsers"];
        put?: never;
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
        getMedia: {
            alt: string | null;
            available: boolean;
            contentType: string;
            createdAt: number;
            description: string | null;
            filename: string;
            folder: string;
            height: number | null;
            id: string;
            /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
            path: string;
            /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
            provenance: {
                at?: number;
                model?: string;
                /** @enum {string} */
                origin: "human" | "ai" | "mixed" | "unknown";
                tool?: string;
            };
            size: number;
            title: string | null;
            updatedAt: number;
            variantCounts: {
                done: number;
                error: number;
                failed: number;
                pending: number;
            };
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
        "getMedia.anonymous": {
            alt: string | null;
            contentType: string;
            description: string | null;
            filename: string;
            height: number | null;
            id: string;
            /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
            path: string;
            /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
            provenance: {
                at?: number;
                model?: string;
                /** @enum {string} */
                origin: "human" | "ai" | "mixed" | "unknown";
                tool?: string;
            };
            size: number;
            title: string | null;
            variants: {
                format: string;
                height: number;
                path: string;
                size: string;
                width: number;
            }[];
            width: number | null;
        };
        getRedirects: {
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
        "getRedirects.anonymous": {
            /** @description origin locale per field, only with fallback */
            _locales?: {
                [key: string]: string;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            id: string;
            rules?: unknown | null;
        };
        getSettings: {
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
            mounts?: unknown | null;
            navigation?: unknown | null;
            title?: string | null;
            titlePosition?: ("suffix" | "prefix") | null;
            titleSeparator?: string | null;
            updatedAt: number;
        };
        "getSettings.anonymous": {
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
            description?: string | null;
            id: string;
            navigation?: unknown | null;
            title?: string | null;
            titlePosition?: ("suffix" | "prefix") | null;
            titleSeparator?: string | null;
        };
        listBlog: {
            items: {
                /** @description origin locale per field, only with fallback */
                _locales?: {
                    [key: string]: string;
                };
                /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                _paths: {
                    [key: string]: string | null;
                };
                /** @description per locale: required localized fields present */
                _translations?: {
                    [key: string]: boolean;
                };
                blockAliases?: unknown | null;
                body?: unknown | null;
                createdAt: number;
                id: string;
                seo?: unknown | null;
                slug?: string | null;
                status?: ("draft" | "finished" | "published") | null;
                title?: string | null;
                updatedAt: number;
            }[];
            total: number;
        };
        "listBlog.anonymous": {
            items: {
                /** @description origin locale per field, only with fallback */
                _locales?: {
                    [key: string]: string;
                };
                /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                _paths: {
                    [key: string]: string | null;
                };
                /** @description per locale: required localized fields present */
                _translations?: {
                    [key: string]: boolean;
                };
                body?: unknown | null;
                id: string;
                seo?: unknown | null;
                slug?: string | null;
                status?: ("draft" | "finished" | "published") | null;
                title?: string | null;
            }[];
            total: number;
        };
        listMedia: {
            items: {
                alt: string | null;
                available: boolean;
                contentType: string;
                createdAt: number;
                description: string | null;
                filename: string;
                folder: string;
                height: number | null;
                id: string;
                /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
                path: string;
                /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                provenance: {
                    at?: number;
                    model?: string;
                    /** @enum {string} */
                    origin: "human" | "ai" | "mixed" | "unknown";
                    tool?: string;
                };
                size: number;
                title: string | null;
                updatedAt: number;
                variantCounts: {
                    done: number;
                    error: number;
                    failed: number;
                    pending: number;
                };
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
        "listMedia.anonymous": {
            items: {
                alt: string | null;
                contentType: string;
                description: string | null;
                filename: string;
                height: number | null;
                id: string;
                /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
                path: string;
                /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                provenance: {
                    at?: number;
                    model?: string;
                    /** @enum {string} */
                    origin: "human" | "ai" | "mixed" | "unknown";
                    tool?: string;
                };
                size: number;
                title: string | null;
                variants: {
                    format: string;
                    height: number;
                    path: string;
                    size: string;
                    width: number;
                }[];
                width: number | null;
            }[];
            total: number;
        };
        listPages: {
            items: {
                /** @description origin locale per field, only with fallback */
                _locales?: {
                    [key: string]: string;
                };
                /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                _paths: {
                    [key: string]: string | null;
                };
                /** @description per locale: required localized fields present */
                _translations?: {
                    [key: string]: boolean;
                };
                accent?: string | null;
                blockAliases?: unknown | null;
                body?: unknown | null;
                createdAt: number;
                id: string;
                layout?: string | null;
                parent?: string | null;
                seo?: unknown | null;
                shareImage?: string | null;
                slug?: string | null;
                status?: ("draft" | "finished" | "published") | null;
                title?: string | null;
                updatedAt: number;
            }[];
            total: number;
        };
        "listPages.anonymous": {
            items: {
                /** @description origin locale per field, only with fallback */
                _locales?: {
                    [key: string]: string;
                };
                /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                _paths: {
                    [key: string]: string | null;
                };
                /** @description per locale: required localized fields present */
                _translations?: {
                    [key: string]: boolean;
                };
                accent?: string | null;
                body?: unknown | null;
                id: string;
                layout?: string | null;
                seo?: unknown | null;
                shareImage?: string | null;
                slug?: string | null;
                status?: ("draft" | "finished" | "published") | null;
                title?: string | null;
            }[];
            total: number;
        };
        readBlog: {
            /** @description origin locale per field, only with fallback */
            _locales?: {
                [key: string]: string;
            };
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            blockAliases?: unknown | null;
            body?: unknown | null;
            createdAt: number;
            id: string;
            seo?: unknown | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
            updatedAt: number;
        };
        "readBlog.anonymous": {
            /** @description origin locale per field, only with fallback */
            _locales?: {
                [key: string]: string;
            };
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            body?: unknown | null;
            id: string;
            seo?: unknown | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
        };
        readPage: {
            /** @description origin locale per field, only with fallback */
            _locales?: {
                [key: string]: string;
            };
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            accent?: string | null;
            blockAliases?: unknown | null;
            body?: unknown | null;
            createdAt: number;
            id: string;
            layout?: string | null;
            parent?: string | null;
            seo?: unknown | null;
            shareImage?: string | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
            updatedAt: number;
        };
        "readPage.anonymous": {
            /** @description origin locale per field, only with fallback */
            _locales?: {
                [key: string]: string;
            };
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            accent?: string | null;
            body?: unknown | null;
            id: string;
            layout?: string | null;
            seo?: unknown | null;
            shareImage?: string | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
        };
        renderRedirects: {
            from: string;
            pattern: string;
            /** @enum {integer} */
            status: 301 | 302 | 307 | 308;
            target: string;
        }[];
        "renderRedirects.anonymous": {
            from: string;
            pattern: string;
            /** @enum {integer} */
            status: 301 | 302 | 307 | 308;
            target: string;
        }[];
        resolveBlog: {
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
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths?: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            blockAliases?: unknown | null;
            body?: unknown | null;
            createdAt: number;
            id: string;
            seo?: unknown | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
            updatedAt: number;
        };
        "resolveBlog.anonymous": {
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
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths?: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            body?: unknown | null;
            id: string;
            seo?: unknown | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
        };
        resolvePage: {
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
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths?: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            accent?: string | null;
            blockAliases?: unknown | null;
            body?: unknown | null;
            createdAt: number;
            id: string;
            layout?: string | null;
            parent?: string | null;
            seo?: unknown | null;
            shareImage?: string | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
            updatedAt: number;
        } | {
            redirect: {
                /** @enum {integer} */
                status: 301 | 302 | 307 | 308;
                to: string;
            };
        } | {
            route: {
                type: string;
            };
        };
        "resolvePage.anonymous": {
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
            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
            _paths?: {
                [key: string]: string | null;
            };
            /** @description per locale: required localized fields present */
            _translations?: {
                [key: string]: boolean;
            };
            accent?: string | null;
            body?: unknown | null;
            id: string;
            layout?: string | null;
            seo?: unknown | null;
            shareImage?: string | null;
            slug?: string | null;
            status?: ("draft" | "finished" | "published") | null;
            title?: string | null;
        } | {
            redirect: {
                /** @enum {integer} */
                status: 301 | 302 | 307 | 308;
                to: string;
            };
        } | {
            route: {
                type: string;
            };
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type SchemaError = components['schemas']['Error'];
export type SchemaGetMedia = components['schemas']['getMedia'];
export type SchemaGetMediaAnonymous = components['schemas']['getMedia.anonymous'];
export type SchemaGetRedirects = components['schemas']['getRedirects'];
export type SchemaGetRedirectsAnonymous = components['schemas']['getRedirects.anonymous'];
export type SchemaGetSettings = components['schemas']['getSettings'];
export type SchemaGetSettingsAnonymous = components['schemas']['getSettings.anonymous'];
export type SchemaListBlog = components['schemas']['listBlog'];
export type SchemaListBlogAnonymous = components['schemas']['listBlog.anonymous'];
export type SchemaListMedia = components['schemas']['listMedia'];
export type SchemaListMediaAnonymous = components['schemas']['listMedia.anonymous'];
export type SchemaListPages = components['schemas']['listPages'];
export type SchemaListPagesAnonymous = components['schemas']['listPages.anonymous'];
export type SchemaReadBlog = components['schemas']['readBlog'];
export type SchemaReadBlogAnonymous = components['schemas']['readBlog.anonymous'];
export type SchemaReadPage = components['schemas']['readPage'];
export type SchemaReadPageAnonymous = components['schemas']['readPage.anonymous'];
export type SchemaRenderRedirects = components['schemas']['renderRedirects'];
export type SchemaRenderRedirectsAnonymous = components['schemas']['renderRedirects.anonymous'];
export type SchemaResolveBlog = components['schemas']['resolveBlog'];
export type SchemaResolveBlogAnonymous = components['schemas']['resolveBlog.anonymous'];
export type SchemaResolvePage = components['schemas']['resolvePage'];
export type SchemaResolvePageAnonymous = components['schemas']['resolvePage.anonymous'];
export type $defs = Record<string, never>;
export interface operations {
    listAllBlog: {
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
                            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                            _paths: {
                                [key: string]: string | null;
                            };
                            /** @description per locale: required localized fields present */
                            _translations?: {
                                [key: string]: boolean;
                            };
                            blockAliases?: unknown | null;
                            body?: unknown | null;
                            createdAt: number;
                            id: string;
                            seo?: unknown | null;
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
            /** @description missing permission blog.manage */
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
    readAnyBlog: {
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
                        /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                        _paths: {
                            [key: string]: string | null;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        seo?: unknown | null;
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
            /** @description missing permission blog.manage */
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
    blogRevisions: {
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
            /** @description missing permission blog.manage */
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
    blogRevision: {
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
            /** @description missing permission blog.manage */
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
    labelBlogRevision: {
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
            /** @description missing permission blog.write */
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
    restoreBlogRevision: {
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
                    blockAliases?: unknown | null;
                    body?: unknown | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    seo?: unknown | null;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        restore?: {
                            dropped: string[];
                            missing: string[];
                            revisionId: string;
                        };
                        seo?: unknown | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description missing permission blog.write */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
    previewBlogPath: {
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
                    locale?: string;
                    parent?: string | null;
                    slug: string;
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
                        conflict: {
                            id: string;
                            label: string;
                            locale: string;
                            path: string;
                            type: string;
                        } | null;
                        exposesParentSlug: {
                            id: string;
                            label: string;
                            type: string;
                        } | null;
                        path: string;
                        reachable: boolean;
                        reason: string | null;
                        shadows: {
                            id: string;
                            label: string;
                            path: string;
                            type: string;
                        }[];
                    };
                };
            };
            /** @description slug is missing */
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
            /** @description missing permission blog.write */
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
            /** @description the store is unavailable */
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
    eventsDeliveryStatus: {
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
                        lastDeadAt: number | null;
                        /** @enum {string} */
                        scope: "store" | "process";
                        since: number | null;
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
            /** @description the queue could not be read */
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
                        lanes: {
                            [key: string]: {
                                oldestPendingAt: number | null;
                                pending: number;
                                running: number;
                            };
                        };
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
            /** @description media item not found or not ready */
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
                                    /** @description The name of the host layer that supplied the default; present only when the value comes from the module entry's defaults */
                                    source?: string;
                                    /**
                                     * @description set: the raw config carries the path; default: it does not and the value comes from the entry's host-supplied defaults or from this node's or an ancestor's default; missing: no value at all
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
                                    /** @enum {string} */
                                    anonymous?: "required";
                                    atomicSafe?: boolean;
                                    binary?: boolean;
                                    errors?: {
                                        [key: string]: string;
                                    };
                                    extendsItems?: {
                                        [key: string]: unknown;
                                    };
                                    extendsOutput?: {
                                        [key: string]: unknown;
                                    };
                                    input?: {
                                        [key: string]: unknown;
                                    };
                                    multipart?: boolean;
                                    narrows?: {
                                        answers: {
                                            [key: string]: string[];
                                        };
                                        /** @enum {string} */
                                        shape: "item" | "list" | "array" | "file";
                                    };
                                    output?: {
                                        [key: string]: unknown;
                                    };
                                    query?: {
                                        [key: string]: {
                                            [key: string]: unknown;
                                        };
                                    };
                                    reads: string[];
                                    /** @enum {string} */
                                    security?: "required" | "optional";
                                    summary: string;
                                    terminalOutput?: {
                                        [key: string]: unknown;
                                    };
                                    writes: string[];
                                };
                                module: string;
                                name: string;
                                spec: string;
                            }[];
                        }[];
                        steps: {
                            description: {
                                /** @enum {string} */
                                anonymous?: "required";
                                atomicSafe?: boolean;
                                binary?: boolean;
                                errors?: {
                                    [key: string]: string;
                                };
                                extendsItems?: {
                                    [key: string]: unknown;
                                };
                                extendsOutput?: {
                                    [key: string]: unknown;
                                };
                                input?: {
                                    [key: string]: unknown;
                                };
                                multipart?: boolean;
                                narrows?: {
                                    answers: {
                                        [key: string]: string[];
                                    };
                                    /** @enum {string} */
                                    shape: "item" | "list" | "array" | "file";
                                };
                                output?: {
                                    [key: string]: unknown;
                                };
                                query?: {
                                    [key: string]: {
                                        [key: string]: unknown;
                                    };
                                };
                                reads: string[];
                                /** @enum {string} */
                                security?: "required" | "optional";
                                summary: string;
                                terminalOutput?: {
                                    [key: string]: unknown;
                                };
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
                        warnings: ({
                            /** @description The check that produced it; a minor release may add codes */
                            code: string;
                            message: string;
                        } & {
                            [key: string]: string;
                        })[];
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
    repairPublicMedia: {
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
                        _publicMedia: {
                            missing: number;
                            removed: number;
                            written: number;
                        };
                        _publicVariants: {
                            missing: number;
                            planned: number;
                            removed: number;
                            written: number;
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
                            /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                            _paths: {
                                [key: string]: string | null;
                            };
                            /** @description per locale: required localized fields present */
                            _translations?: {
                                [key: string]: boolean;
                            };
                            accent?: string | null;
                            blockAliases?: unknown | null;
                            body?: unknown | null;
                            createdAt: number;
                            id: string;
                            layout?: string | null;
                            parent?: string | null;
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
                        /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                        _paths: {
                            [key: string]: string | null;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        accent?: string | null;
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        parent?: string | null;
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
                    blockAliases?: unknown | null;
                    body?: unknown | null;
                    layout?: string | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    parent?: string | null;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        parent?: string | null;
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
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
    previewPagePath: {
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
                    locale?: string;
                    parent?: string | null;
                    slug: string;
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
                        conflict: {
                            id: string;
                            label: string;
                            locale: string;
                            path: string;
                            type: string;
                        } | null;
                        exposesParentSlug: {
                            id: string;
                            label: string;
                            type: string;
                        } | null;
                        path: string;
                        reachable: boolean;
                        reason: string | null;
                        shadows: {
                            id: string;
                            label: string;
                            path: string;
                            type: string;
                        }[];
                    };
                };
            };
            /** @description slug is missing */
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
            /** @description internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the store is unavailable */
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
    pageTree: {
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
                        id: string;
                        label: string;
                        /** @description per locale: whether the document passes its route's liveWhen there */
                        live: {
                            [key: string]: boolean;
                        };
                        parent: string | null;
                        /** @description public path per locale; null where the document is not reachable (site.attachPaths without ?reachable: not valid) */
                        paths: {
                            [key: string]: string | null;
                        };
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
            /** @description the store is unavailable */
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
    rebuildPaths: {
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
                        conflicts: {
                            locale: string;
                            losers: Record<string, never>[];
                            path: string;
                            /** @enum {string} */
                            reason: "taken" | "reserved" | "locale";
                            winner: Record<string, never> | null;
                        }[];
                        indexed: number;
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
            /** @description the store is unavailable */
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
    publishAllBlog: {
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
                        marked: number;
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
            /** @description missing permission blog.manage */
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
            /** @description the marks or their jobs could not be written */
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
                        marked: number;
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
            /** @description the marks or their jobs could not be written */
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
    retryStalePages: {
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
    blogPublishStatus: {
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
                        dependencies: number | null;
                        docId: string;
                        error?: string | null;
                        locale: string;
                        path?: string | null;
                        publishedAt?: number | null;
                        stale: boolean;
                        staleError: string | null;
                        staleFailed: boolean;
                        staleSince: number | null;
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
            /** @description missing permission blog.manage */
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
    pagesStaleStatus: {
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
                        abandoned: number;
                        failed: number;
                        oldestStaleAt: number | null;
                        rendering: number;
                        stale: number;
                        unknown: number;
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
                        dependencies: number | null;
                        docId: string;
                        error?: string | null;
                        locale: string;
                        path?: string | null;
                        publishedAt?: number | null;
                        stale: boolean;
                        staleError: string | null;
                        staleFailed: boolean;
                        staleSince: number | null;
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
    listAutoRedirects: {
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
                        docId: string;
                        from: string;
                        locale: string;
                        seq: number;
                        to: string;
                        type: string;
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
    removeAutoRedirect: {
        parameters: {
            query?: never;
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
                        redirects: {
                            rules: number;
                            skipped: string[];
                        };
                    };
                };
            };
            /** @description missing path */
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
            /** @description no automatic redirect at that path */
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
    blogReferrersMany: {
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
            /** @description missing permission blog.manage */
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
    blogReferrers: {
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
            /** @description missing permission blog.manage */
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
            /** @description no user id, or the former author again */
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
    listBlog: {
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["listBlog"] | components["schemas"]["listBlog.anonymous"];
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
            /** @description no field grant on blog for a caller without an identity or a configured role */
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
    createBlog: {
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
                    blockAliases?: unknown | null;
                    body?: unknown | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    seo?: unknown | null;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        seo?: unknown | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description missing permission blog.write */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
    readBlog: {
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["readBlog"] | components["schemas"]["readBlog.anonymous"];
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
            /** @description no field grant on blog for a caller without an identity or a configured role */
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
    deleteBlog: {
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
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        ok: boolean;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description missing permission blog.delete */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
    updateBlog: {
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
                    blockAliases?: unknown | null;
                    body?: unknown | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    seo?: unknown | null;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        seo?: unknown | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description missing permission blog.write */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
    deleteBlogTranslation: {
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description origin locale per field, only with fallback */
                        _locales?: {
                            [key: string]: string;
                        };
                        /** @description per locale: required localized fields present */
                        _translations?: {
                            [key: string]: boolean;
                        };
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        seo?: unknown | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description missing permission blog.write */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
                    code?: string;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        identity: {
                            claims: {
                                [key: string]: unknown;
                            };
                            id: string;
                        };
                        recoveryCodes?: string[];
                        token: string;
                    };
                };
            };
            /** @description an account name longer than 320 characters */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the code is wrong or used (`UNAUTHENTICATED`), a code is needed (`SECOND_FACTOR_REQUIRED`), or the account must set up a second factor first (`SECOND_FACTOR_SETUP_REQUIRED`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description too many wrong codes in a row; the factor is locked for a while (`RATE_LIMITED`) */
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
    setupSecondFactor: {
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
                    enrollmentCode?: string;
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
                        secret: string;
                        uri: string;
                    };
                };
            };
            /** @description an account name longer than 320 characters */
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
            /** @description the account needs the enrollment code a reset issued (`ENROLLMENT_CODE_REQUIRED`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description the account already has a second factor */
            409: {
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
            /** @description a state-changing request authenticated by the session cookie is not from the same origin */
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
            /** @description a state-changing request authenticated by the session cookie is not from the same origin */
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
    confirmPassword: {
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
                        ok: boolean;
                    };
                };
            };
            /** @description the password is missing or wrong */
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
            /** @description this account has no role */
            403: {
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
                    email?: string;
                    newPassword: string;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
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
            /** @description this account has no role */
            403: {
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
                type?: "image" | "video" | "other";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["listMedia"] | components["schemas"]["listMedia.anonymous"];
                };
            };
            /** @description invalid folder, unknown locale, invalid type, or limit above maxLimit */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description no identity and no ids (unless anonymousList is "all") */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description no field grant on media for a caller without an identity or a configured role */
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
                    "application/json": ({
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        alt: string | null;
                        contentType: string;
                        createdAt: number;
                        description: string | null;
                        filename: string;
                        folder: string;
                        height: number | null;
                        id: string;
                        /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
                        path: string;
                        /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                        provenance: {
                            at?: number;
                            model?: string;
                            /** @enum {string} */
                            origin: "human" | "ai" | "mixed" | "unknown";
                            tool?: string;
                        };
                        size: number;
                        title: string | null;
                        updatedAt: number;
                        width: number | null;
                    } | {
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        errors: {
                            code: string;
                            filename: string;
                            message: string;
                            status: number;
                        }[];
                        /** @description the newly stored items only; an unchanged re-upload is in `items` but not here, and is not announced as an event */
                        ids: string[];
                        items: {
                            alt: string | null;
                            contentType: string;
                            createdAt: number;
                            description: string | null;
                            filename: string;
                            folder: string;
                            height: number | null;
                            id: string;
                            /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
                            path: string;
                            /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                            provenance: {
                                at?: number;
                                model?: string;
                                /** @enum {string} */
                                origin: "human" | "ai" | "mixed" | "unknown";
                                tool?: string;
                            };
                            size: number;
                            title: string | null;
                            updatedAt: number;
                            width: number | null;
                        }[];
                    }) | ({
                        alt: string | null;
                        contentType: string;
                        createdAt: number;
                        description: string | null;
                        filename: string;
                        folder: string;
                        height: number | null;
                        id: string;
                        /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
                        path: string;
                        /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                        provenance: {
                            at?: number;
                            model?: string;
                            /** @enum {string} */
                            origin: "human" | "ai" | "mixed" | "unknown";
                            tool?: string;
                        };
                        size: number;
                        title: string | null;
                        updatedAt: number;
                        width: number | null;
                    } | {
                        errors: {
                            code: string;
                            filename: string;
                            message: string;
                            status: number;
                        }[];
                        /** @description the newly stored items only; an unchanged re-upload is in `items` but not here, and is not announced as an event */
                        ids: string[];
                        items: {
                            alt: string | null;
                            contentType: string;
                            createdAt: number;
                            description: string | null;
                            filename: string;
                            folder: string;
                            height: number | null;
                            id: string;
                            /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
                            path: string;
                            /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                            provenance: {
                                at?: number;
                                model?: string;
                                /** @enum {string} */
                                origin: "human" | "ai" | "mixed" | "unknown";
                                tool?: string;
                            };
                            size: number;
                            title: string | null;
                            updatedAt: number;
                            width: number | null;
                        }[];
                    });
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
            /** @description the folder already has a file with that name, `details.field: "location"` (per-file for a multi-file request); the same bytes again are idempotent, not a conflict */
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["getMedia"] | components["schemas"]["getMedia.anonymous"];
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
            /** @description no field grant on media for a caller without an identity or a configured role */
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        alt: string | null;
                        contentType: string;
                        createdAt: number;
                        description: string | null;
                        filename: string;
                        folder: string;
                        height: number | null;
                        id: string;
                        /** @description the file's one public URL, <publicPath>/<id>/<name>; the name is fixed at upload, so renaming or moving the item never changes it */
                        path: string;
                        /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                        provenance: {
                            at?: number;
                            model?: string;
                            /** @enum {string} */
                            origin: "human" | "ai" | "mixed" | "unknown";
                            tool?: string;
                        };
                        size: number;
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
            /** @description the folder already has a file with that name, `details.field: "location"` */
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
    serveMediaFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                name: string;
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
            /** @description no field grant on mediaFile for a caller without an identity or a configured role */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description not found, not ready, or not the name the file was uploaded under */
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
            /** @description no field grant on mediaFile for a caller without an identity or a configured role */
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
            /** @description no field grant on mediaFile for a caller without an identity or a configured role */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description media item not found, not ready or hidden, or the file is neither a current nor a retired size */
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
            /** @description no identity (unless anonymousList is "all") */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description with an authz module, no listPermission */
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
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        ids: string[];
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
    listMediaTrash: {
        parameters: {
            query?: {
                limit?: number;
                locale?: string;
                offset?: number;
                q?: string;
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
                            contentType: string;
                            createdAt: number;
                            description: string | null;
                            /** @description trashedAt plus trashRetentionDays; from then on media.selectExpiredTrash selects the item */
                            expiresAt: number;
                            filename: string;
                            /** @description the folder the item is restored to */
                            folder: string;
                            height: number | null;
                            id: string;
                            /** @description a trashed item has no public URL until it is restored */
                            path: null;
                            /** @description who made the file; anything but human is flagged on download (X-Content-Provenance); an upload without provenance is recorded as unknown */
                            provenance: {
                                at?: number;
                                model?: string;
                                /** @enum {string} */
                                origin: "human" | "ai" | "mixed" | "unknown";
                                tool?: string;
                            };
                            size: number;
                            title: string | null;
                            trashedAt: number;
                            updatedAt: number;
                            width: number | null;
                        }[];
                        total: number;
                    };
                };
            };
            /** @description unknown locale or limit above maxLimit */
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
    trashMedia: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description every id that is in the target state after the step, whether the step moved it or found it there */
                        ids: string[];
                        skipped: {
                            id: string;
                            /** @description not_found or not_trashed from media-default; an earlier step of a purge may add its own, such as referenced */
                            reason: string;
                        }[];
                        /** @description per id in ids, the item's trash version after the step; it rises by one with every move into or out of the trash, which lets a later step tell which of two overlapping moves came last */
                        trashVersions: {
                            [key: string]: number;
                        };
                        /** @description the ids in ids that were already in the target state before the step; they are handed on in ids, so a repeated step reaches every later step again */
                        unchanged: string[];
                    };
                };
            };
            /** @description no ids or more than 200 */
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
    emptyMediaTrash: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids?: string[];
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description the ids the step acted on or selected */
                        ids: string[];
                        skipped: {
                            id: string;
                            /** @description not_found or not_trashed from media-default; an earlier step of a purge may add its own, such as referenced */
                            reason: string;
                        }[];
                    };
                };
            };
            /** @description no ids selected and no body.ids, or more than 200 body.ids */
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
    trashMediaFolder: {
        parameters: {
            query?: never;
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
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        ids: string[];
                        path: string;
                        /** @description per id in ids, the item's trash version after the step; it rises by one with every move into or out of the trash, which lets a later step tell which of two overlapping moves came last */
                        trashVersions: {
                            [key: string]: number;
                        };
                        unchanged: string[];
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
            /** @description missing permission media.delete */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description neither a folder nor a trashed item at this path */
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
    purgeMedia: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description the ids the step acted on or selected */
                        ids: string[];
                        skipped: {
                            id: string;
                            /** @description not_found or not_trashed from media-default; an earlier step of a purge may add its own, such as referenced */
                            reason: string;
                        }[];
                    };
                };
            };
            /** @description no ids selected and no body.ids, or more than 200 body.ids */
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
    restoreMedia: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        /** @description every id that is in the target state after the step, whether the step moved it or found it there */
                        ids: string[];
                        /** @description restored items whose display name was taken and that came back as <stem>-<n>.<ext>; key and path are unchanged */
                        renamed: {
                            from: string;
                            id: string;
                            to: string;
                        }[];
                        skipped: {
                            id: string;
                            /** @description not_found or not_trashed from media-default; an earlier step of a purge may add its own, such as referenced */
                            reason: string;
                        }[];
                        /** @description per id in ids, the item's trash version after the step; it rises by one with every move into or out of the trash, which lets a later step tell which of two overlapping moves came last */
                        trashVersions: {
                            [key: string]: number;
                        };
                        /** @description the ids in ids that were already in the target state before the step; they are handed on in ids, so a repeated step reaches every later step again */
                        unchanged: string[];
                    };
                };
            };
            /** @description no ids or more than 200 */
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["listPages"] | components["schemas"]["listPages.anonymous"];
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
            /** @description no field grant on pages for a caller without an identity or a configured role */
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
                    blockAliases?: unknown | null;
                    body?: unknown | null;
                    layout?: string | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    parent?: string | null;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        parent?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["readPage"] | components["schemas"]["readPage.anonymous"];
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
            /** @description no field grant on pages for a caller without an identity or a configured role */
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
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        ok: boolean;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
                    blockAliases?: unknown | null;
                    body?: unknown | null;
                    layout?: string | null;
                    /** @enum {string} */
                    locale?: "de" | "en";
                    parent?: string | null;
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        parent?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
                        blockAliases?: unknown | null;
                        body?: unknown | null;
                        createdAt: number;
                        id: string;
                        layout?: string | null;
                        parent?: string | null;
                        seo?: unknown | null;
                        shareImage?: string | null;
                        slug?: string | null;
                        status?: ("draft" | "finished" | "published") | null;
                        title?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description the path is reserved or starts with a locale code, or the written locale is published without a slug of its own */
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
            /** @description another document holds the path */
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
            /** @description the store is unavailable */
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["getRedirects"] | components["schemas"]["getRedirects.anonymous"];
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
            /** @description no field grant on redirects for a caller without an identity or a configured role */
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["renderRedirects"] | components["schemas"]["renderRedirects.anonymous"];
                };
            };
            /** @description no field grant on redirectRules for a caller without an identity or a configured role */
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
    resolveBlog: {
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["resolveBlog"] | components["schemas"]["resolveBlog.anonymous"];
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
            /** @description no field grant on blog for a caller without an identity or a configured role */
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["getSettings"] | components["schemas"]["getSettings.anonymous"];
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
            /** @description no field grant on settings for a caller without an identity or a configured role */
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
                    mounts: unknown;
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
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
                        mounts?: unknown | null;
                        navigation?: unknown | null;
                        title?: string | null;
                        titlePosition?: ("suffix" | "prefix") | null;
                        titleSeparator?: string | null;
                        updatedAt: number;
                    };
                };
            };
            /** @description an invalid assignment, or a change moving more than maxCascade paths */
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
            /** @description a moved document's path is taken */
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
            /** @description the store is unavailable */
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
            /** @description ok; x-kestrel-answers names the answer each audience receives */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["resolvePage"] | components["schemas"]["resolvePage.anonymous"];
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
            /** @description no field grant on pages for a caller without an identity or a configured role */
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
                        _events: {
                            pipelines: {
                                attempts: number;
                                dead: boolean;
                                error: string | null;
                                event: string;
                                pipeline: string;
                                /** @enum {string} */
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        ok: boolean;
                    };
                };
            };
            /** @description password missing or too short, or the caller's own account */
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
    resetSecondFactor: {
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
                                status: "done" | "error" | "pending" | "queued";
                            }[];
                            /** @enum {string} */
                            status: "done" | "error" | "pending" | "queued";
                        };
                        enrollmentCode: string;
                        ok: boolean;
                    };
                };
            };
            /** @description the caller's own account */
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
            /** @description the last password check is older than the window (`REAUTH_REQUIRED`) */
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
    secondFactorUsers: {
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
                    "application/json": string[];
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
}
