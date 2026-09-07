<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ id: string; contentType?: string; alt?: string }>()
const isImage = computed(() => (props.contentType ?? 'image/').startsWith('image/'))
</script>

<template>
  <img v-if="isImage" :src="mediaFileUrl(id)" :alt="alt ?? ''" loading="lazy" decoding="async" draggable="false">
  <span v-else class="media-thumb--file" aria-hidden="true"><KestrelUiIcon name="file-text" :size="32" /></span>
</template>

<style lang="scss" scoped>
.media-thumb--file {
  display: grid;
  place-items: center;
  color: var(--color-text-subtle);
}
</style>
