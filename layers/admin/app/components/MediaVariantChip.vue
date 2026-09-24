<script setup lang="ts">
import { computed } from 'vue'
import type { IconName } from '#kestrel-admin/utils/icons'

const props = defineProps<{ id?: string; state: 'pending' | 'stalled' | 'failed'; done?: number; total?: number }>()
const { t } = useT()

const icon = computed<IconName>(() => (props.state === 'failed' ? 'triangle-alert' : 'clock'))
const text = computed(() => {
  if (props.state === 'failed') return t('media.tile.variantsFailed')
  if (props.state === 'stalled') return t('media.tile.variantsStalled')
  return t('media.tile.variantsPending', { done: props.done ?? 0, total: props.total ?? 0 })
})
</script>

<template>
  <span :id="id" class="media-variant-chip" :class="`media-variant-chip--${state}`">
    <KestrelUiIcon :name="icon" :size="14" aria-hidden="true" />
    <span class="media-variant-chip__text">{{ text }}</span>
  </span>
</template>

<style lang="scss">
.media-variant-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-scrim);
  color: var(--color-on-primary);
  font-size: var(--text-xs);
  line-height: 1.35;
  max-width: 100%;
}

.media-variant-chip__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
