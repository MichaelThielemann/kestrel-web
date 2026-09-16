<script setup lang="ts">
import { VueFlow, useVueFlow, Position } from '@vue-flow/core'
import type { Edge, Node } from '@vue-flow/core'
import type { GraphEdge, GraphNode } from '#kestrel-admin/utils/insights-graph'
import { layoutGraph } from '#kestrel-admin/utils/insights-layout'

const props = defineProps<{ nodes: GraphNode[]; edges: GraphEdge[] }>()
const emit = defineEmits<{ select: [id: string | null] }>()

const { fitView, getSelectedNodes } = useVueFlow()

const reducedMotion = ref(false)
let mediaQuery: MediaQueryList | null = null
function syncReducedMotion() {
  reducedMotion.value = mediaQuery?.matches ?? false
}
onMounted(() => {
  if (!import.meta.client) return
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncReducedMotion()
  mediaQuery.addEventListener('change', syncReducedMotion)
})
onUnmounted(() => mediaQuery?.removeEventListener('change', syncReducedMotion))

const positions = computed(() => layoutGraph(props.nodes, props.edges))

const flowNodes = computed<Node[]>(() =>
  props.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: positions.value.get(n.id) ?? { x: 0, y: 0 },
    data: n,
    focusable: true,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  })),
)

const flowEdges = computed<Edge[]>(() =>
  props.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    animated: !reducedMotion.value && e.kind === 'pipeline',
    class: `insights-graph-edge insights-graph-edge--${e.kind}`,
    focusable: true,
  })),
)

watch(getSelectedNodes, (nodes) => emit('select', nodes[0]?.id ?? null))

let fitViewFrame: number | null = null
watch(() => [props.nodes, props.edges], () => {
  fitViewFrame = requestAnimationFrame(() => fitView())
})
onUnmounted(() => {
  if (fitViewFrame !== null) cancelAnimationFrame(fitViewFrame)
})

defineExpose({ fitView: () => fitView() })
</script>

<template>
  <VueFlow
    :nodes="flowNodes"
    :edges="flowEdges"
    :nodes-connectable="false"
    :nodes-focusable="true"
    :edges-focusable="true"
    fit-view-on-init
    :min-zoom="0.2"
    :max-zoom="2"
    class="insights-graph-canvas"
  >
    <template #node-module="nodeProps">
      <KestrelInsightsGraphNode :data="nodeProps.data" :selected="nodeProps.selected" />
    </template>
    <template #node-trigger="nodeProps">
      <KestrelInsightsGraphNode :data="nodeProps.data" :selected="nodeProps.selected" />
    </template>
  </VueFlow>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
</style>

<style lang="scss">
.insights-graph-canvas {
  width: 100%;
  height: 100%;
  background: var(--color-bg);

  .vue-flow__node {
    background: transparent;
    border: none;
    padding: 0;
    width: 220px;

    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
      border-radius: var(--radius-md);
    }
  }

  .vue-flow__node-trigger {
    width: 160px;
  }

  .vue-flow__edge-path {
    stroke: var(--color-border-strong);
    stroke-width: 1.5;
  }

  .insights-graph-edge--contract-optional .vue-flow__edge-path {
    stroke-dasharray: 6 4;
  }

  .insights-graph-edge--pipeline .vue-flow__edge-path {
    stroke: var(--color-primary);
    stroke-width: 2;
  }

  .insights-graph-edge--trigger .vue-flow__edge-path {
    stroke: var(--color-warning);
    stroke-dasharray: 2 3;
  }

  .vue-flow__edge-textbg {
    fill: var(--color-surface);
  }

  .vue-flow__edge-text {
    fill: var(--color-text);
    font-size: var(--text-xs);
  }

  .vue-flow__edge.selected .vue-flow__edge-path,
  .vue-flow__edge:focus-visible .vue-flow__edge-path {
    outline: none;
    stroke: var(--color-focus);
  }

  .vue-flow__background {
    background: var(--color-bg);
  }
}
</style>
