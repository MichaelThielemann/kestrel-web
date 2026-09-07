<script setup lang="ts">
withDefaults(defineProps<{ sticky?: boolean }>(), { sticky: true })
</script>

<template>
  <table class="ui-table" :class="{ 'ui-table--sticky': sticky }">
    <thead><tr><slot name="head" /></tr></thead>
    <tbody><slot name="body" /></tbody>
  </table>
</template>

<style lang="scss">
.ui-table {
  --ui-table-select-w: 2.75rem;

  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  overflow: hidden;

  th,
  td {
    text-align: start;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    vertical-align: top;
  }

  thead th {
    color: var(--color-text-muted);
    font-weight: var(--weight-medium);
    background: var(--color-bg);
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  &--sticky thead th {
    position: sticky;
    top: 0;
    z-index: 2;
  }

  &--sticky thead th.ui-table__col--select,
  &--sticky thead th.ui-table__col--actions {
    z-index: 3;
  }

  tbody tr:hover {
    background: var(--color-hover);
  }

  &__row--muted td {
    color: var(--color-text-muted);
    font-style: italic;
  }

  &__col--select,
  &__col--actions {
    position: sticky;
    z-index: 1;
    width: 1%;
    white-space: nowrap;
    vertical-align: middle;
    background: var(--color-bg);
  }
  &__col--select {
    left: 0;
    width: var(--ui-table-select-w);
  }
  &__col--actions {
    left: var(--ui-table-select-w);
  }

  &__actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  &__vh {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
