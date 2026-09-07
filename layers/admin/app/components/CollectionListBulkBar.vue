<script setup lang="ts">

defineProps<{ count: number; hasStatus: boolean; busy: boolean }>()
const emit = defineEmits<{ setStatus: [status: 'published' | 'draft']; delete: []; clear: [] }>()

const { t } = useT()
</script>

<template>
  <div class="list__bulkbar" role="toolbar" :aria-label="t('list.selected', { n: count })">
    <p class="list__bulk-count" role="status" aria-live="polite">{{ t('list.selected', { n: count }) }}</p>
    <template v-if="hasStatus">
      <KestrelUiButton type="button" size="sm" variant="ghost" :disabled="busy" @click="emit('setStatus', 'published')">{{ t('list.bulkPublish') }}</KestrelUiButton>
      <KestrelUiButton type="button" size="sm" variant="ghost" :disabled="busy" @click="emit('setStatus', 'draft')">{{ t('list.bulkUnpublish') }}</KestrelUiButton>
    </template>
    <KestrelUiButton type="button" size="sm" variant="danger-ghost" :disabled="busy" @click="emit('delete')">{{ t('list.bulkDelete') }}</KestrelUiButton>
    <KestrelUiButton type="button" size="sm" variant="ghost" icon="x" :aria-label="t('list.clearSelection')" @click="emit('clear')" />
  </div>
</template>

<style lang="scss">
.list {
  &__bulkbar {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    flex: 0 0 auto;
  }
  &__bulk-count {
    padding-inline-end: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }
}
</style>
