import { computed, onUnmounted, ref, watch, watchEffect, type Ref } from 'vue'
import type { UploadItem } from './useMediaUpload'
import type { useUploadPreview } from './useUploadPreview'

export interface UseUploadTilesOptions {
  queue: Ref<UploadItem[]>
  view: Ref<'grid' | 'table'>
  folder: Ref<string>
  preview: ReturnType<typeof useUploadPreview>
  dismiss: (id: string) => void
}

export function useUploadTiles(options: UseUploadTilesOptions) {
  const { queue, view, folder, preview, dismiss } = options
  const promoted = ref<Set<string>>(new Set())

  function markSettled(settledFolder: string) {
    for (const item of queue.value) {
      if (item.status === 'done' && item.folder === settledFolder) promoted.value.add(item.id)
    }
  }

  watchEffect(() => {
    for (const item of queue.value) {
      if (item.status === 'done' && item.folder !== folder.value) promoted.value.add(item.id)
    }
  })

  const trackedUploads = computed(() => queue.value.filter((i) => i.status === 'failed' || !promoted.value.has(i.id)))
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

  return { gridTileUploads, queueRows, markSettled, onDismissUpload }
}
