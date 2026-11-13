<script setup lang="ts">
defineProps<{
  label: string
  clearLabel: string
  clearShortcut?: { keys: string; label: string }
  busy?: boolean
}>()
const emit = defineEmits<{ clear: [] }>()
</script>

<template>
  <div class="ui-bulkbar" role="toolbar" :aria-label="label" :aria-busy="busy || undefined">
    <p class="ui-bulkbar__count" role="status" aria-live="polite">{{ label }}</p>
    <slot name="extra" />
    <slot />
    <KestrelUiTooltip v-if="clearShortcut">
      <KestrelUiButton type="button" size="sm" variant="ghost" icon="x" class="ui-bulkbar__clear" :aria-label="clearLabel" :aria-keyshortcuts="clearShortcut.keys" @click="emit('clear')" />
      <template #content>{{ clearLabel }} <kbd class="ui-bulkbar__kbd">{{ clearShortcut.label }}</kbd></template>
    </KestrelUiTooltip>
    <KestrelUiButton v-else type="button" size="sm" variant="ghost" icon="x" class="ui-bulkbar__clear" :aria-label="clearLabel" @click="emit('clear')" />
  </div>
</template>

<style lang="scss" scoped>
.ui-bulkbar {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  flex: 0 0 auto;

  &__count {
    margin: 0;
    padding-inline-end: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }

  &__clear { min-height: 1.5rem; }
}
</style>

<style lang="scss">
.ui-bulkbar__kbd {
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: var(--text-xs);
}
</style>
