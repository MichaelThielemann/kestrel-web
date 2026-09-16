<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { GraphNode } from '#kestrel-admin/utils/insights-graph'

const props = defineProps<{ data: GraphNode; selected: boolean }>()

const { t } = useT()

const TRIGGER_LABEL_KEYS = { http: 'insights.graph.triggerHttp', event: 'insights.graph.triggerEvent', cron: 'insights.graph.triggerCron' } as const

const triggerLabel = computed(() => {
  const trigger = props.data.trigger
  if (!trigger) return ''
  return `${t(TRIGGER_LABEL_KEYS[trigger.kind])} (${trigger.count})`
})
</script>

<template>
  <div class="insights-graph-node" :class="{ 'insights-graph-node--selected': selected, 'insights-graph-node--trigger': data.kind === 'trigger' }">
    <template v-if="data.kind === 'module'">
      <Handle id="contracts-in" type="target" :position="Position.Left" :connectable="false" class="insights-graph-node__handle" :style="{ top: '30%' }" />
      <Handle id="steps-in" type="target" :position="Position.Left" :connectable="false" class="insights-graph-node__handle" :style="{ top: '55%' }" />
      <Handle id="trigger-in" type="target" :position="Position.Left" :connectable="false" class="insights-graph-node__handle" :style="{ top: '80%' }" />
      <Handle id="contracts-out" type="source" :position="Position.Right" :connectable="false" class="insights-graph-node__handle" :style="{ top: '30%' }" />
      <Handle id="steps-out" type="source" :position="Position.Right" :connectable="false" class="insights-graph-node__handle" :style="{ top: '60%' }" />

      <header class="insights-graph-node__head">
        <span class="insights-graph-node__name">{{ data.module?.name }}</span>
        <span v-if="data.module?.version" class="insights-graph-node__version">{{ data.module.version }}</span>
      </header>

      <div class="insights-graph-node__chips">
        <span v-for="c in data.module?.provides" :key="`p-${c}`" class="insights-graph-node__chip insights-graph-node__chip--provides">{{ c }}</span>
        <span v-for="c in data.module?.requires" :key="`r-${c}`" class="insights-graph-node__chip insights-graph-node__chip--requires">{{ c }}</span>
        <span v-for="c in data.module?.optional" :key="`o-${c}`" class="insights-graph-node__chip insights-graph-node__chip--optional">{{ c }}</span>
      </div>

      <footer class="insights-graph-node__meta">
        <span v-if="data.module?.steps.length">{{ t('insights.graph.steps', { count: data.module.steps.length }) }}</span>
        <span v-if="data.counts.config">{{ t('insights.graph.config', { count: data.counts.config }) }}</span>
        <span v-if="data.counts.errors" class="insights-graph-node__meta--errors">{{ t('insights.graph.errors', { count: data.counts.errors }) }}</span>
        <span v-if="data.module?.eventHook" class="insights-graph-node__badge">{{ t('insights.graph.eventHook') }}</span>
      </footer>
    </template>

    <template v-else>
      <Handle id="trigger-out" type="source" :position="Position.Right" :connectable="false" class="insights-graph-node__handle" />
      <span class="insights-graph-node__trigger-label">{{ triggerLabel }}</span>
    </template>
  </div>
</template>

<style lang="scss">
.insights-graph-node {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  height: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  box-sizing: border-box;
  overflow: hidden;

  &--trigger {
    align-items: center;
    justify-content: center;
    background: var(--color-surface-2);
    border-style: dashed;
  }

  &--selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-soft);
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  &__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__name {
    font-weight: var(--weight-bold);
    font-size: var(--text-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__version {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  &__chip {
    font-size: var(--text-xs);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface-2);
    color: var(--color-text-muted);

    &--provides {
      background: var(--color-primary-soft);
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    &--optional {
      border-style: dashed;
    }
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: auto;

    &--errors {
      color: var(--color-danger);
    }
  }

  &__badge {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--color-warning);
    color: var(--color-bg);
  }

  &__trigger-label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  &__handle {
    width: 8px;
    height: 8px;
    background: var(--color-border-strong);
    border: none;
  }
}
</style>
