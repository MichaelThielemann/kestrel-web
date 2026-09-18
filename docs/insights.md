# Insights

`/admin/insights` shows the booted Kestrel instance: every module with its contracts, config
variables, steps and pipelines, every trigger, process-local live numbers, and a wiring graph. The
data comes from the `insights` module (`@michaelthielemann/kestrel-insights`) through two routes the
preset wires when the `insights` feature is on:

| route | pipeline | permission |
|---|---|---|
| `GET /api/admin/insights/manifest` | `insightsManifest` (`authn.requireUser`, `authz.require:insights.read`, `insights.readManifest`) | `insights.read` |
| `GET /api/admin/insights/stats` | `insightsStats` (same guard, `insights.readStats`) | `insights.read` |

The manifest is static for the lifetime of the process (modules, versions, config *schemas* without
values, step descriptions, pipelines with step order, triggers). The stats are counters and
percentiles aggregated in this process only; they reset on restart and differ per instance behind a
load balancer. The page says so above the live tab.

## Recent failures
`stats().recentFailures` is a ring buffer of the last failed runs of this process, newest first, each
`{ at, runId, pipeline, trigger: { kind, name }, status, ms, code?, step?, message? }`. Its size is the
`recentFailures` config of the `insights` module (default 50, `0` turns it off). `InsightsFailures.vue`
renders it above the pipeline counters on the live tab: time (relative, with the absolute time in
`title`), pipeline, trigger, status, code, step, message and run id. The message wraps, every other long
value ellipsizes as an `.insights-chip` with the full text in `title`, and `KestrelUiEmptyState` covers
the case of no failure yet.

`message` is the text the caller already received in the HTTP answer, truncated by the backend and never
a stack — an unexpected `throw` only contributes `"<pipeline>/<step>: unexpected <ErrorName>"`, its own
text and stack stay in the process log. Module authors must therefore keep connection strings, tokens
and other secrets out of `error.message`; whatever a step puts there reaches both the caller and this
table.

The field is optional in `InsightsStats`, so an admin built against an older backend that answers
without `recentFailures` renders the empty state instead of failing.

## Enabling it
- `shared/model.ts`: add `"insights"` to `features`.
- `kestrel.config.ts`: add `{ use: "@michaelthielemann/kestrel-insights", config: {} }` to `modules`.
- The role that should see the page needs `insights.read` (the example admin role has `*`).

Without the module the page renders an info alert ("not available"); without the permission a
warning. The rail link appears when the `insights` feature is on and `can('insights.read')` is
true; today `canWithRoles` (`composables/useAuth.ts`) only grants `insights.read` to the `admin`
role.

## Pieces
- `layers/admin/app/composables/useInsights.ts` — one `useState` holding manifest, stats and the
  availability (`ok`, `notFound`, `forbidden`, `error`); `loadManifest()` is cached, `loadStats()`
  is what the live tab polls.
- `pages/admin/insights/index.vue` — the tab shell (`?tab=modules|pipelines|triggers|live|graph`).
- `pages/admin/insights/modules/[...name].vue` — one module: contracts, config variables with
  set/not-set status (secrets never show a default), owned steps with their descriptions, pipelines
  that use the module.
- `components/Insights*.vue` — one component per tab plus `InsightsConfigVariables`,
  `InsightsStepCard`, `InsightsSchema` (a depth-limited JSON Schema renderer).
- `assets/scss/_insights.scss`: `.insights-chip` never wraps inside itself and ellipsizes past
  `16rem` (full value in `title`); a table cell holding several chips (steps, triggers,
  provides/requires/optional) gets `.insights-chip-cell` so wrapping happens between chips, not
  inside one.
- `utils/insights-format.ts` — pure helpers over the manifest (config summary, pipelines using a
  module, triggers of a pipeline, formatting); tested against
  `utils/__fixtures__/insights-manifest.json` and `insights-stats.json`, which mirror the API shapes
  in `layers/core/app/types/api.ts`.

## Graph
`InsightsGraph.vue` renders the toolbar, legend, side panel and text alternative; it lazily imports
the canvas through `defineAsyncComponent(() => import('#kestrel-insights-canvas'))` inside
`<ClientOnly>`. The `insights-graph` Nuxt module of the admin layer points that alias at
`InsightsGraphCanvas.vue` when `@vue-flow/core` and `@dagrejs/dagre` are installed (both are optional
peer dependencies) and adds them to Vite's `optimizeDeps`; otherwise it points at
`InsightsGraphUnavailable.vue`, which renders a notice, so consumers without the graph packages build
without them. Only the canvas component imports Vue Flow, so the rest of the admin bundle never
carries it. `utils/insights-graph.ts` builds the graph without any DOM:

- one node per module with a config count and a declared-error-code count (`insights.graph.errors`,
  distinct HTTP status codes the module's steps declare in `describe().errors`, not runtime error
  occurrences — both counts render in the same muted colour as the step count);
- contract edges from the provider to each module that `requires` (solid) or `optional`ly uses
  (dashed) the contract;
- pipeline edges between the modules of consecutive steps, deduplicated per module pair with the
  pipeline names collected on the edge;
- one trigger node per kind (HTTP, event, cron) with an edge to the module owning the first step of
  each triggered pipeline; the visible trigger label is translated in `InsightsGraphNode.vue` and
  `InsightsGraph.vue` from `insights.graph.triggerHttp`/`triggerEvent`/`triggerCron`.

`utils/insights-layout.ts` holds `layoutGraph`, the only function that imports dagre; it runs dagre
left-to-right and returns top-left positions. Edge families can be toggled; the legend explains the
line styles; a selected node opens a side panel with a link to the module page. Every node is
focusable (Enter selects it), and a text alternative below the canvas lists the same edges in words
for screen readers.
