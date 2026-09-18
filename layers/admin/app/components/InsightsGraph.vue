<script setup lang="ts">
import type { InsightsManifest } from '#kestrel-admin/types/api'
import { buildGraph } from '#kestrel-admin/utils/insights-graph'
import { moduleRoute } from '#kestrel-admin/utils/insights-format'

const props = defineProps<{ manifest: InsightsManifest }>()

const { t } = useT()

const InsightsGraphCanvas = defineAsyncComponent(() => import('#kestrel-insights-canvas'))

const showContracts = ref(true)
const showPipelines = ref(true)
const showTriggers = ref(true)
const selectedId = ref<string | null>(null)
const canvas = ref<{ fitView: () => void } | null>(null)

const graph = computed(() => buildGraph(props.manifest, {
  contracts: showContracts.value,
  pipelines: showPipelines.value,
  triggers: showTriggers.value,
}))

const selectedNode = computed(() => graph.value.nodes.find((n) => n.id === selectedId.value) ?? null)

function onSelect(id: string | null) {
  selectedId.value = id
}

function fitView() {
  canvas.value?.fitView()
}

const TRIGGER_LABEL_KEYS = { http: 'insights.graph.triggerHttp', event: 'insights.graph.triggerEvent', cron: 'insights.graph.triggerCron' } as const

function nodeLabel(node: { kind: 'module' | 'trigger'; label: string; trigger?: { kind: 'http' | 'event' | 'cron'; count: number } }): string {
  if (node.kind === 'trigger' && node.trigger) return `${t(TRIGGER_LABEL_KEYS[node.trigger.kind])} (${node.trigger.count})`
  return node.label
}

const textAlternative = computed(() =>
  graph.value.nodes.filter((n) => n.kind === 'module').map((node) => ({
    id: node.id,
    label: nodeLabel(node),
    incoming: graph.value.edges.filter((e) => e.target === node.id).map((e) => `${e.label} ← ${nodeLabel(graph.value.nodes.find((n) => n.id === e.source) ?? node)}`),
    outgoing: graph.value.edges.filter((e) => e.source === node.id).map((e) => `${e.label} → ${nodeLabel(graph.value.nodes.find((n) => n.id === e.target) ?? node)}`),
  })),
)
</script>

<template>
  <div class="insights-graph">
    <div class="insights-graph__toolbar">
      <label class="insights-graph__toggle">
        <KestrelUiCheckbox v-model="showContracts" />
        {{ t('insights.graph.toggleContracts') }}
      </label>
      <label class="insights-graph__toggle">
        <KestrelUiCheckbox v-model="showPipelines" />
        {{ t('insights.graph.togglePipelines') }}
      </label>
      <label class="insights-graph__toggle">
        <KestrelUiCheckbox v-model="showTriggers" />
        {{ t('insights.graph.toggleTriggers') }}
      </label>
      <KestrelUiButton size="sm" icon="layout-grid" @click="fitView">{{ t('insights.graph.fitView') }}</KestrelUiButton>
    </div>

    <div class="insights-graph__legend">
      <span class="insights-graph__legend-item"><span class="insights-graph__legend-line insights-graph__legend-line--contract" />{{ t('insights.graph.legendContract') }}</span>
      <span class="insights-graph__legend-item"><span class="insights-graph__legend-line insights-graph__legend-line--optional" />{{ t('insights.graph.legendOptional') }}</span>
      <span class="insights-graph__legend-item"><span class="insights-graph__legend-line insights-graph__legend-line--pipeline" />{{ t('insights.graph.legendPipeline') }}</span>
      <span class="insights-graph__legend-item"><span class="insights-graph__legend-line insights-graph__legend-line--trigger" />{{ t('insights.graph.legendTrigger') }}</span>
    </div>

    <div class="insights-graph__body">
      <ClientOnly>
        <InsightsGraphCanvas ref="canvas" class="insights-graph__canvas" :nodes="graph.nodes" :edges="graph.edges" @select="onSelect" />
        <template #fallback>
          <p class="insights-graph__loading">{{ t('insights.graph.loading') }}</p>
        </template>
      </ClientOnly>

      <aside class="insights-graph__panel" aria-live="polite">
        <template v-if="selectedNode?.module">
          <h3 class="insights-graph__panel-title">{{ selectedNode.module.name }}</h3>
          <p class="insights-graph__panel-version">{{ selectedNode.module.version }}</p>
          <p><strong>{{ t('insights.graph.provides') }}:</strong> {{ selectedNode.module.provides.join(', ') || '—' }}</p>
          <p><strong>{{ t('insights.graph.requires') }}:</strong> {{ selectedNode.module.requires.join(', ') || '—' }}</p>
          <p><strong>{{ t('insights.graph.optional') }}:</strong> {{ selectedNode.module.optional.join(', ') || '—' }}</p>
          <p>{{ t('insights.graph.steps', { count: selectedNode.module.steps.length }) }}</p>
          <KestrelUiButton size="sm" :to="moduleRoute(selectedNode.module.name)">{{ t('insights.graph.openModule') }}</KestrelUiButton>
        </template>
        <template v-else-if="selectedNode?.trigger">
          <h3 class="insights-graph__panel-title">{{ nodeLabel(selectedNode) }}</h3>
        </template>
        <KestrelUiEmptyState v-else icon="info" :title="t('insights.graph.selectHint')" />
      </aside>
    </div>

    <details class="insights-graph__alt">
      <summary>{{ t('insights.graph.textAlternative') }}</summary>
      <ul :aria-label="t('insights.graph.moduleAndConnections')">
        <li v-for="module in textAlternative" :key="module.id">
          <strong>{{ module.label }}</strong>
          <div>{{ t('insights.graph.incoming') }}: {{ module.incoming.join('; ') || t('insights.graph.noEdges') }}</div>
          <div>{{ t('insights.graph.outgoing') }}: {{ module.outgoing.join('; ') || t('insights.graph.noEdges') }}</div>
        </li>
      </ul>
    </details>
  </div>
</template>

<style lang="scss">
.insights-graph {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: var(--space-2);

  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }

  &__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text);
  }

  &__legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  &__legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  &__legend-line {
    display: inline-block;
    width: 1.5rem;
    height: 0;
    border-top: 2px solid var(--color-border-strong);

    &--optional {
      border-top-style: dashed;
    }

    &--pipeline {
      border-top-color: var(--color-primary);
      border-top-width: 3px;
    }

    &--trigger {
      border-top-color: var(--color-warning);
      border-top-style: dotted;
    }
  }

  &__body {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: var(--space-3);
  }

  &__canvas {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  &__loading {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  &__panel {
    width: 18rem;
    flex-shrink: 0;
    overflow-y: auto;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    font-size: var(--text-sm);
  }

  &__panel-title {
    font-weight: var(--weight-bold);
    margin: 0;
  }

  &__panel-version {
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2);
  }

  &__alt {
    font-size: var(--text-sm);
    color: var(--color-text-muted);

    ul {
      list-style: none;
      margin: var(--space-2) 0 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  }
}
</style>
