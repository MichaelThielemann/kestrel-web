<script setup lang="ts">
import { computed } from 'vue'
import type { PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaRect } from '#kestrel-admin/types/api'
import { focusBox } from '../utils/crop-overlay'
import { previewStyle } from '../utils/media-crop'

const props = withDefaults(defineProps<{ src: string, crop: PixelCrop | null, width: number, height?: number, focus?: MediaRect | null }>(), { height: 0, focus: null })

const boxStyle = computed(() => (props.crop
  ? { 'aspectRatio': `${props.crop.width} / ${props.crop.height}`, '--media-crop-preview-ratio': String(props.crop.width / props.crop.height) }
  : undefined))
const imageStyle = computed(() => (props.crop ? previewStyle(props.crop, props.width) : undefined))
const outline = computed(() => (props.crop && props.focus && props.height > 0 ? focusBox(props.focus, props.crop, props.width, props.height) : null))
const outlineStyle = computed(() => {
  const box = outline.value
  if (!box) return undefined
  const place = { left: `${box.left}%`, top: `${box.top}%` }
  return box.point ? place : { ...place, width: `${box.width}%`, height: `${box.height}%` }
})
</script>

<template>
  <span class="media-crop-preview" :style="boxStyle" aria-hidden="true">
    <img v-if="crop" class="media-crop-preview__image" :src="src" alt="" :style="imageStyle" draggable="false">
    <span v-if="outline" class="media-crop-preview__focus" :class="{ 'media-crop-preview__focus--point': outline.point }" :style="outlineStyle" data-test="crop-preview-focus" />
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
.media-crop-preview__focus {
  position: absolute;
  border: 1px solid var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-overlay-edge-strong);
}
.media-crop-preview__focus--point {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--radius-full);
  transform: translate(-50%, -50%);
}
</style>
