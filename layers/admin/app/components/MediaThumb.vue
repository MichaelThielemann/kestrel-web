<script setup lang="ts">
import { computed } from 'vue'
import type { MediaVariant } from '#kestrel-admin/types/api'
import { pickVariantThumb } from '../utils/variant-state'

const props = defineProps<{ id: string; contentType?: string; alt?: string; variants?: readonly MediaVariant[]; pending?: boolean }>()
const isImage = computed(() => (props.contentType ?? 'image/').startsWith('image/'))
const thumb = computed(() => pickVariantThumb(props.variants ?? []))
const showPlaceholder = computed(() => props.pending === true && !thumb.value)
const src = computed(() => (thumb.value ? mediaVariantUrl(thumb.value.path) : mediaFileUrl(props.id)))
</script>

<template>
  <span v-if="isImage && showPlaceholder" class="media-thumb--pending" aria-hidden="true"><KestrelUiIcon name="image" :size="32" /></span>
  <img v-else-if="isImage" :src="src" :alt="alt ?? ''" loading="lazy" decoding="async" draggable="false">
  <span v-else class="media-thumb--file" aria-hidden="true"><KestrelUiIcon name="file-text" :size="32" /></span>
</template>

<style lang="scss" scoped>
.media-thumb--file,
.media-thumb--pending {
  display: grid;
  place-items: center;
  color: var(--color-text-subtle);
}
</style>
