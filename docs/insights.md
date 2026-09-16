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

- one node per module with config/error counts;
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
