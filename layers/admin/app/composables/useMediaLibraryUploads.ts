import { computed, nextTick, type Ref } from 'vue'
import type { Translate } from '#kestrel-admin/actions/types'
import { useAnnouncer } from './useAnnouncer'
import { useMediaUpload, type UploadItem } from './useMediaUpload'
import { useUploadPreview } from './useUploadPreview'
import { useUploadTiles } from './useUploadTiles'
import { useVariantWatch } from './useVariantWatch'
import { variantAnnouncement, type VariantResult } from '../utils/variant-announcement'

export interface UseMediaLibraryUploadsOptions {
  folder: Ref<string>
  /** Ids of the files the library lists right now. */
  listedIds: Ref<ReadonlySet<string>>
  view: Ref<'grid' | 'table'>
  fetchLibrary: () => Promise<void>
  t: Translate
  /** The library element; keyboard focus falls back to it when the tile holding focus leaves the grid. */
  root: Ref<HTMLElement | null>
}

export function useMediaLibraryUploads(options: UseMediaLibraryUploadsOptions) {
  const { folder, view, listedIds, fetchLibrary, t, root } = options
  const preview = useUploadPreview()
  const variantWatch = useVariantWatch()
  const { message: announcement, announce } = useAnnouncer<VariantResult>((results) => variantAnnouncement(results, t))

  function onReady(item: UploadItem) {
    if (!item.result?.contentType?.startsWith('image/')) return
    variantWatch.track(item.result.id, {
      onReady: () => announce({ name: item.filename, failed: false }),
      onFailed: () => announce({ name: item.filename, failed: true }),
    })
  }

  const upload = useMediaUpload({
    onQueued: (item) => { void preview.generate(item.id, item.file) },
    onReady,
    onSettled: ({ stopped }) => {
      if (stopped) { variantWatch.pause(); return }
      void refreshLibrary(folder.value)
    },
  })

  function focusedTileUpload(): UploadItem | undefined {
    if (!import.meta.client) return undefined
    const id = document.activeElement?.closest<HTMLElement>('.media-upload-tile')?.dataset.uploadId
    return id ? upload.queue.value.find((i) => i.id === id) : undefined
  }

  async function refreshLibrary(settledFolder: string) {
    await fetchLibrary()
    const focused = focusedTileUpload()
    tiles.markSettled(settledFolder)
    if (focused?.status !== 'done') return
    await nextTick()
    if (document.activeElement && document.activeElement !== document.body) return
    const listed = Array.from(root.value?.querySelectorAll<HTMLElement>('[data-file-id]') ?? []).find((el) => el.dataset.fileId === focused.result?.id)
    const target = listed ?? root.value
    target?.focus()
  }
  const tiles = useUploadTiles({ queue: upload.queue, view, folder, listedIds, preview, dismiss: upload.dismiss })

  const followUp = computed(() => announcement.value || (variantWatch.hasPending.value ? t('media.upload.processing') : ''))

  return {
    queue: upload.queue,
    active: upload.active,
    summary: upload.summary,
    enqueueUploads: upload.enqueueUploads,
    retry: upload.retry,
    retryFailed: upload.retryFailed,
    cancel: upload.cancel,
    canRetry: upload.canRetry,
    clearFinished: upload.clearFinished,
    ensureUploadLimit: upload.ensureUploadLimit,
    maxUploadBytes: upload.maxUploadBytes,
    limitError: upload.limitError,
    gridTileUploads: tiles.gridTileUploads,
    unlistedDone: tiles.unlistedDone,
    onDismissUpload: tiles.onDismissUpload,
    previewFor: preview.previewFor,
    variantResults: variantWatch.results,
    stalledIds: variantWatch.stalled,
    track: variantWatch.track,
    followUp,
  }
}
