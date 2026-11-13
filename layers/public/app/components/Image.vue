<script setup lang="ts">
import type { PublicMediaItem } from '../utils/public-shapes'

const props = withDefaults(defineProps<{
  media: string | PublicMediaItem | null
  size: string
  sizes?: string
  only?: string[]
  alt?: string | null
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  fetchpriority?: 'high' | 'low' | 'auto'
}>(), { loading: 'lazy', decoding: 'async' })

const locale = useSiteLocale()

const id = computed(() => (typeof props.media === 'string' ? props.media : props.media?.id ?? null))
const inline = computed(() => (typeof props.media === 'object' ? props.media : null))

const { data: fetched } = await useMediaItem(() => (inline.value ? null : id.value), locale)

const item = computed(() => inline.value ?? fetched.value ?? null)
const sources = computed(() => pickImageSources(item.value, props.size, props.only))
const altText = computed(() => props.alt ?? item.value?.alt ?? '')
const boxStyle = computed(() => {
  const objectPosition = focusObjectPosition(item.value?.focus)
  const position = objectPosition === undefined ? {} : { objectPosition }
  if (sources.value?.variant) return { aspectRatio: `${sources.value.width} / ${sources.value.height}`, objectFit: 'cover' as const, ...position }
  return objectPosition === undefined ? undefined : position
})
</script>

<template>
  <img
    v-if="sources"
    :src="sources.src"
    :srcset="sources.srcset ?? undefined"
    :sizes="sources.srcset ? sizes : undefined"
    :width="sources.width ?? undefined"
    :height="sources.height ?? undefined"
    :style="boxStyle"
    :alt="altText"
    :loading="loading"
    :decoding="decoding"
    :fetchpriority="fetchpriority"
  >
</template>
