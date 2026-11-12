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

  const gridTileUploads = computed(() => (view.value === 'grid'
    ? queue.value.filter((i) => i.folder === folder.value && (i.status !== 'done' || !promoted.value.has(i.id)))
    : []))

  const stopReleaseWatch = watch(() => queue.value.map((i) => i.id), (curr, prev) => {
    const currIds = new Set(curr)
    for (const id of prev ?? []) if (!currIds.has(id)) preview.release(id)
  })

  onUnmounted(() => {
    stopReleaseWatch()
    preview.releaseAll()
  })

  function onDismissUpload(id: string) {
    preview.release(id)
    dismiss(id)
  }

  return { gridTileUploads, markSettled, onDismissUpload }
}
