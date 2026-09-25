import type { Ref } from 'vue'
import type { MediaItem } from '#kestrel-core/app/types/api'
import { toPublicMedia, type PublicMediaItem } from '../utils/public-shapes'

function onMediaError(mediaId: string, e: unknown): null {
  if (apiErrorStatus(e) !== 404) console.error(`useMediaItem: media "${mediaId}" could not be loaded: ${apiErrorMessage(e)}`)
  return null
}

/** Reads a media item by id, keyed `media:<id>:<locale>`, and keeps its public fields only; a 404 resolves quietly to `null`. Reads only by id (public anonymous reads never list). */
export function useMediaItem(id: () => string | null, locale: Ref<string>) {
  const api = useApi()

  return useAsyncData<MediaItem | null, unknown, PublicMediaItem | null>(
    () => `media:${id() ?? ''}:${locale.value}`,
    () => {
      const mediaId = id()
      if (!mediaId) return Promise.resolve(null)
      return api<MediaItem>(`/media/${encodeURIComponent(mediaId)}`, { query: { locale: locale.value } }).catch((e: unknown) => onMediaError(mediaId, e))
    },
    { watch: [id, locale], transform: (item) => (item ? toPublicMedia(item) : null) },
  )
}
