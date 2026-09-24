<script setup lang="ts">
import { computed } from 'vue'
import type { IconName } from '#kestrel-admin/utils/icons'

const props = defineProps<{ state: 'pending' | 'stalled' | 'failed'; done?: number; total?: number }>()
const { t } = useT()

const icon = computed<IconName>(() => (props.state === 'failed' ? 'triangle-alert' : 'clock'))
const fullText = computed(() => {
  if (props.state === 'failed') return t('media.tile.variantsFailed')
  if (props.state === 'stalled') return t('media.tile.variantsStalled')
  return t('media.tile.variantsPending', { done: props.done ?? 0, total: props.total ?? 0 })
})
const shortText = computed(() => {
  if (props.state === 'pending') return `${props.done ?? 0}/${props.total ?? 0}`
  return t(props.state === 'failed' ? 'media.tile.variantsFailedShort' : 'media.tile.variantsStalledShort')
})
</script>

<template>
  <span class="media-variant-chip" :class="`media-variant-chip--${state}`" :title="fullText">
    <KestrelUiIcon :name="icon" :size="14" aria-hidden="true" />
    <span class="media-variant-chip__text" aria-hidden="true">{{ shortText }}</span>
    <span class="media-variant-chip__full">{{ fullText }}</span>
  </span>
</template>

<style lang="scss">
@use '../assets/scss/mixins';

.media-variant-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-badge-bg);
  color: var(--color-badge-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  line-height: 1.35;
  max-width: 100%;
}

.media-variant-chip__text {
  white-space: nowrap;
}

.media-variant-chip__full {
  @include mixins.sr-only;
}
</style>
