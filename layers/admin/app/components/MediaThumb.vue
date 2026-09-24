<script setup lang="ts">
import { computed } from 'vue'
import type { MediaVariant } from '#kestrel-admin/types/api'
import { pickVariantThumb } from '../utils/variant-state'

const props = defineProps<{ id: string; contentType?: string; alt?: string; variants?: readonly MediaVariant[] }>()
const isImage = computed(() => (props.contentType ?? 'image/').startsWith('image/'))
const src = computed(() => {
  const thumb = pickVariantThumb(props.variants ?? [])
  return thumb ? mediaVariantUrl(thumb.path) : mediaFileUrl(props.id)
})
</script>

<template>
  <img v-if="isImage" :src="src" :alt="alt ?? ''" loading="lazy" decoding="async" draggable="false">
  <span v-else class="media-thumb--file" aria-hidden="true"><KestrelUiIcon name="file-text" :size="32" /></span>
</template>

<style lang="scss" scoped>
.media-thumb--file {
  display: grid;
  place-items: center;
  color: var(--color-text-subtle);
}
</style>
