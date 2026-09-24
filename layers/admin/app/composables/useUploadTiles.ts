import { computed, onUnmounted, watch, type Ref } from 'vue'
import type { MediaItem } from '#kestrel-admin/types/api'
import type { UploadItem } from './useMediaUpload'
import type { useUploadPreview } from './useUploadPreview'

export interface UseUploadTilesOptions {
  queue: Ref<UploadItem[]>
  files: Ref<MediaItem[]>
  view: Ref<'grid' | 'table'>
  folder: Ref<string>
  preview: ReturnType<typeof useUploadPreview>
  dismiss: (id: string) => void
}

function isPromoted(item: UploadItem, files: MediaItem[]): boolean {
  return item.result !== undefined && files.some((f) => f.id === item.result!.id)
}

export function useUploadTiles(options: UseUploadTilesOptions) {
  const { queue, files, view, folder, preview, dismiss } = options

  const trackedUploads = computed(() => queue.value.filter((i) => i.status === 'failed' || !isPromoted(i, files.value)))
  const gridTileUploads = computed(() => (view.value === 'grid' ? trackedUploads.value.filter((i) => i.folder === folder.value) : []))
  const queueRows = computed(() => (view.value === 'grid' ? trackedUploads.value.filter((i) => i.folder !== folder.value) : trackedUploads.value))

  watch(trackedUploads, (curr, prev) => {
    const currIds = new Set(curr.map((i) => i.id))
    for (const item of prev ?? []) if (!currIds.has(item.id)) preview.release(item.id)
  })

  onUnmounted(() => preview.releaseAll())

  function onDismissUpload(id: string) {
    preview.release(id)
    dismiss(id)
  }

  return { gridTileUploads, queueRows, onDismissUpload }
}
