<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'muted' | 'counter' }>(), { variant: 'muted' })
</script>

<template>
  <span class="ui-badge" :data-variant="variant"><slot /></span>
</template>

<style lang="scss">
.ui-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-block-size: 1.25rem;
  padding-inline: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;

  &[data-variant='muted'] {
    background: var(--color-surface-2);
    border-color: var(--color-border);
    color: var(--color-text-muted);
  }

  &[data-variant='counter'] {
    justify-content: center;
    min-inline-size: 1.25rem;
    padding-inline: var(--space-1);
    border-radius: var(--radius-full);
    background: var(--color-badge-bg);
    color: var(--color-badge-text);
    font-variant-numeric: tabular-nums;
  }
}
</style>
