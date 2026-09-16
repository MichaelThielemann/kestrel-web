<script setup lang="ts">
import type { GraphEdge, GraphNode } from '#kestrel-admin/utils/insights-graph'

defineProps<{ nodes: GraphNode[]; edges: GraphEdge[] }>()
defineEmits<{ select: [id: string | null] }>()

const { t } = useT()

defineExpose({ fitView: () => {} })
</script>

<template>
  <p class="insights-graph__unavailable" role="status">{{ t('insights.graph.unavailable') }}</p>
</template>
