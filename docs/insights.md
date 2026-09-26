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

## Config
The first tab lists every config variable of every module, grouped by module, with its path, type,
required flag, effective value, default and set/default/missing status. The module heading links to
the module page, and the table is named after it (`aria-labelledby`), so the grouping is announced.
A bare `/admin/insights` lands on the first tab of the strip: `DEFAULT_TAB` is `TAB_IDS[0]`, so the
strip order is the single source of truth and reordering `TAB_IDS` moves the landing tab with it. A
`?tab=` deep link still wins over the default, and an unknown value falls back to the first tab.

The effective value (`value` on a config variable) is what the config sets, otherwise the schema
default. The backend serialises it as a JSON snapshot:
functions, class instances and Buffers become type labels such as `"[function]"`, a `Date` its ISO
string, and long strings, wide arrays, deep nesting and cycles are truncated with a marker. The
admin renders that snapshot with `JSON.stringify`, carries the full text in `title`, and offers a copy
button from 24 characters on; in the Value and Default columns of the config table, a long snapshot
wraps onto further lines within a bounded width instead of forcing the column wider.

A variable that is redacted — `redacted: true` from the backend, or `secret` in the schema — shows a
lock icon and the word "redacted" and never a value, neither in the Value nor in the Default column,
and its value is also excluded from the filter. The filter box matches module name, variable path and
visible value.

`value` and `redacted` are both optional in `InsightsConfigVariable`, so a backend that answers
without them renders an em dash in the Value column instead of failing. Modules with no config
variable at all are collected behind a collapsed disclosure below the tables. The module detail page
renders the same table component (`InsightsConfigVariables.vue`), Value column included.

### Origin of a default value

A module entry can carry its config as `{ config?, defaults?: { from, values } }` instead of a
single `config` object: `presetModuleConfig()` (`layers/core/pipelines/config.ts`) builds every
module's config this way, putting everything it derives into `defaults.values` under
`from: "preset"` and leaving `config` to the consumer's own values and `overrides`. A variable whose
path only `defaults.values` carries answers `status: "default"` with `source` set to that name; the
Status column then reads "Default · Preset" instead of a bare "Default", in the same blue as any
other default. A path `config` carries — the consumer's own, or an override of a preset value — is
`status: "set"` and never carries `source`, the same green dot as before. Secrets redact the same way
in both layers.

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

## Boot warnings
`manifest.warnings` is the static list of non-fatal conditions the instance's boot found — the same
entries as the core's `kestrel.warnings` — visible above the tabs on every one, for anyone with
`insights.read`. Each entry is `{ code, message, ...context }`, where every context field besides `code`
and `message` is a string (a pipeline name, an event, a step, a key). `InsightsBootWarnings.vue` renders
nothing for an empty list; otherwise a code chip, the message, and a definition list of the context
fields, in the fixed order `pipeline`, `event`, `step`, `key` with a translated label, followed by any
other field alphabetically under its raw key. This is deliberate: a boot check a later minor adds needs no
admin change to show up correctly, known field or not.

## Recent failures vs. boot warnings
A boot warning is static and about configuration; a recent failure is a run that actually happened. Each
attempt at a delivery is a run like any other, so it counts in `stats()` of the process that ran it —
`recentFailures` and `pipelines[].failed` both see it. What never reaches `stats()` or `manifest.warnings`
is the *delivery* itself, the fact that a queue row or an inline listener gave up for good after its last
attempt: that count lives only in `events.readDeliveryStatus`, which folds every attempt of one delivery
into a single dead/not-dead outcome. See the dashboard link and the System → Events tab.

## Enabling it
- Install `@michaelthielemann/kestrel-insights` — it is an optional peer dependency of kestrel-web, so
  it is not there by default. `@vue-flow/core` and `@dagrejs/dagre` are needed for the graph tab only.
- `shared/model.ts`: add `"insights"` to `features`. `presetModuleConfig()` then adds
  `{ use: "@michaelthielemann/kestrel-insights", config: {} }` to the module list itself; a
  hand-written `modules` list has to carry that entry.
- The role that should see the page needs `insights.read` (the example admin role has `*`).

Without the module the page renders an info alert ("not available"); without the permission a
warning. The rail link, the page and the manifest and stats requests all follow the
`insightsManifest`/`insightsStats` capabilities from the booted schema
(`useCapabilities().has('insightsManifest')`), not a role name — any role whose `authz.require`
permission the insights module's pipelines are gated on sees them.

## Pieces
- `layers/admin/app/composables/useInsights.ts` — one `useState` holding manifest, stats and the
  availability (`ok`, `notFound`, `forbidden`, `error`); `loadManifest()` is cached, `loadStats()`
  is what the live tab polls.
- `pages/admin/insights/index.vue` — the tab shell (`?tab=config|modules|pipelines|triggers|live|graph`).
- `utils/insights-tabs.ts` — `INSIGHTS_TABS` (strip order), `DEFAULT_INSIGHTS_TAB` (its first entry)
  and `insightsTabFromQuery`, so strip order and landing tab cannot drift apart.
- `pages/admin/insights/modules/[...name].vue` — one module: contracts, config variables with
  set/not-set status (secrets never show a default), owned steps with their descriptions, pipelines
  that use the module.
- `components/Insights*.vue` — one component per tab plus `InsightsConfigVariables` (the per-module
  config table, shared by the config tab and the module page), `InsightsConfigValue` (one value cell:
  redaction, truncation, copy button), `InsightsStepCard`, `InsightsSchema` (a depth-limited JSON
  Schema renderer).
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

Each module becomes one node showing its config count and how many distinct HTTP error codes its
steps declare (`insights.graph.errors` — codes declared in `describe().errors`, not runtime error
occurrences; both counts render in the same muted colour as the step count). Edges show contract
relationships (solid where a module `requires` the contract, dashed where it only `optional`ly uses
it), pipeline order between the modules of consecutive steps (deduplicated per module pair, with the
pipeline names collected on the edge), and one node per trigger kind (HTTP, event, cron) pointing at
the module that starts its pipeline — the trigger label is translated from
`insights.graph.triggerHttp`/`triggerEvent`/`triggerCron`.

`utils/insights-layout.ts` holds `layoutGraph`, the only function that imports dagre; it runs dagre
left-to-right and returns top-left positions. Edge families can be toggled; the legend explains the
line styles; a selected node opens a side panel with a link to the module page. Every node is
focusable (Enter selects it), and a text alternative below the canvas lists the same edges in words
for screen readers.

Below the phone breakpoint (`useIsPhone`, 640px) the canvas and side panel give way to that same text
alternative, shown directly instead of behind a disclosure, with a short hint above it; the toolbar
keeps the contract/pipeline/trigger toggles but drops "Fit view" and the legend, since there is no
canvas to fit or annotate. `InsightsGraphTextAlternative.vue` renders the list for both layouts.
