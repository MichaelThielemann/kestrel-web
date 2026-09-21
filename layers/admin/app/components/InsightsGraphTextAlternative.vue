<script setup lang="ts">
defineProps<{
  modules: { id: string; label: string; incoming: string[]; outgoing: string[] }[]
}>()

const { t } = useT()
</script>

<template>
  <ul :aria-label="t('insights.graph.moduleAndConnections')">
    <li v-for="module in modules" :key="module.id">
      <strong>{{ module.label }}</strong>
      <div>{{ t('insights.graph.incoming') }}: {{ module.incoming.join('; ') || t('insights.graph.noEdges') }}</div>
      <div>{{ t('insights.graph.outgoing') }}: {{ module.outgoing.join('; ') || t('insights.graph.noEdges') }}</div>
    </li>
  </ul>
</template>
