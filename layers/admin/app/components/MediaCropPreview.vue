<script setup lang="ts">
import { computed } from 'vue'
import type { PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import { previewStyle } from '../utils/media-crop'

const props = defineProps<{ src: string, crop: PixelCrop | null, width: number }>()

const boxStyle = computed(() => (props.crop ? { aspectRatio: `${props.crop.width} / ${props.crop.height}` } : undefined))
const imageStyle = computed(() => (props.crop ? previewStyle(props.crop, props.width) : undefined))
</script>

<template>
  <span class="media-crop-preview" :style="boxStyle" aria-hidden="true">
    <img v-if="crop" class="media-crop-preview__image" :src="src" alt="" :style="imageStyle" draggable="false">
  </span>
</template>

<style lang="scss" scoped>
.media-crop-preview {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  box-shadow: 0 0 0 1px var(--color-border);
}
.media-crop-preview__image {
  position: absolute;
  max-width: none;
  height: auto;
}
</style>
