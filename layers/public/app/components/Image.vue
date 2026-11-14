<script setup lang="ts">
import { getCurrentInstance, mergeProps, useId } from 'vue'
import { imageSizes } from '#kestrel/image-sizes'
import type { ImageMedia } from '../utils/public-shapes'
import type { ImageArtEntry } from '../utils/image-variants'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  media: string | ImageMedia | null
  size: string
  sizes?: string
  art?: ImageArtEntry[]
  only?: string[]
  alt?: string | null
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  fetchpriority?: 'high' | 'low' | 'auto'
}>(), { loading: 'lazy', decoding: 'async' })

const attrs = useAttrs()
const artKey = useId()
const scopeId = getCurrentInstance()?.vnode.scopeId ?? null
const locale = useSiteLocale()

const id = computed(() => (typeof props.media === 'string' ? props.media : props.media?.id ?? null))
const inline = computed(() => (typeof props.media === 'object' ? props.media : null))

const { data: fetched } = await useMediaItem(() => (inline.value ? null : id.value), locale)

const item = computed(() => inline.value ?? fetched.value ?? null)
const sources = computed(() => pickImageSources(item.value, props.size, props.only, imageSizes))
const artSources = computed(() => (props.art?.length ? pickArtSources(item.value, props.art, props.only, imageSizes, props.sizes) : []))
const altText = computed(() => props.alt ?? item.value?.alt ?? '')
const boxStyle = computed(() => {
  const objectPosition = focusObjectPosition(item.value?.focus)
  const position = objectPosition === undefined ? {} : { objectPosition }
  if (artSources.value.length) return { objectFit: 'cover' as const, ...position }
  if (sources.value?.variant) return { aspectRatio: `${sources.value.width} / ${sources.value.height}`, objectFit: 'cover' as const, ...position }
  return objectPosition === undefined ? undefined : position
})
const artSelector = `:where(img[data-kestrel-art="${artKey}"])`
const artCss = computed(() => (artSources.value.length ? artBoxCss(artSelector, sources.value, artSources.value) : ''))
useHead(() => ({ style: artCss.value ? [{ key: `kestrel-art-${artKey}`, innerHTML: artCss.value }] : [] }))
const imgAttrs = computed(() => ({
  src: sources.value?.src,
  srcset: sources.value?.srcset ?? undefined,
  sizes: sources.value?.srcset ? props.sizes : undefined,
  width: sources.value?.width ?? undefined,
  height: sources.value?.height ?? undefined,
  alt: altText.value,
  loading: props.loading,
  decoding: props.decoding,
  fetchpriority: props.fetchpriority,
}))

function imgProps() {
  const art = artSources.value.length
    ? { ...(artCss.value ? { 'data-kestrel-art': artKey } : {}), ...(scopeId ? { [scopeId]: '' } : {}) }
    : {}
  return mergeProps(imgAttrs.value, { style: boxStyle.value }, art, attrs)
}
</script>

<template>
  <picture v-if="sources && artSources.length">
    <source
      v-for="source in artSources"
      :key="source.media"
      :media="source.media"
      :srcset="source.srcset"
      :sizes="source.sizes"
      :width="source.width ?? undefined"
      :height="source.height ?? undefined"
    >
    <img v-bind="imgProps()">
  </picture>
  <img v-else-if="sources" v-bind="imgProps()">
</template>
