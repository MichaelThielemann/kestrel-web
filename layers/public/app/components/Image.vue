<script setup lang="ts">
import type { MediaItem } from '#kestrel-core/app/types/api'

const props = withDefaults(defineProps<{
  media: string | MediaItem | null
  size: string
  sizes?: string
  only?: string[]
  alt?: string | null
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  fetchpriority?: 'high' | 'low' | 'auto'
}>(), { loading: 'lazy', decoding: 'async' })

const api = useApi()
const locale = useSiteLocale()

const id = computed(() => (typeof props.media === 'string' ? props.media : props.media?.id ?? null))
const inline = computed(() => (typeof props.media === 'object' ? props.media : null))

function onMediaError(mediaId: string, e: unknown): null {
  if (apiErrorStatus(e) !== 404) console.error(`Image: media "${mediaId}" could not be loaded: ${apiErrorMessage(e)}`)
  return null
}

const { data: fetched } = await useAsyncData<MediaItem | null>(
  () => `media:${id.value ?? ''}:${locale.value}`,
  () => {
    const mediaId = id.value
    if (!mediaId || inline.value) return Promise.resolve(null)
    return api<MediaItem>(`/media/${encodeURIComponent(mediaId)}`, { query: { locale: locale.value } }).catch((e: unknown) => onMediaError(mediaId, e))
  },
  { watch: [id, locale] },
)

const item = computed(() => inline.value ?? fetched.value ?? null)
const sources = computed(() => pickImageSources(item.value, props.size, props.only))
const altText = computed(() => props.alt ?? item.value?.alt ?? '')
</script>

<template>
  <img
    v-if="sources"
    :src="sources.src"
    :srcset="sources.srcset ?? undefined"
    :sizes="sources.srcset ? sizes : undefined"
    :width="sources.width ?? undefined"
    :height="sources.height ?? undefined"
    :alt="altText"
    :loading="loading"
    :decoding="decoding"
    :fetchpriority="fetchpriority"
  >
</template>
