import { computed, type Ref } from 'vue'
import type { Translate } from '#kestrel-admin/actions/types'
import { useAnnouncer } from './useAnnouncer'
import { useMediaUpload, type UploadItem } from './useMediaUpload'
import { useUploadPreview } from './useUploadPreview'
import { useUploadTiles } from './useUploadTiles'
import { useVariantWatch } from './useVariantWatch'

export interface UseMediaLibraryUploadsOptions {
  folder: Ref<string>
  view: Ref<'grid' | 'table'>
  fetchLibrary: () => Promise<void>
  t: Translate
}

export function useMediaLibraryUploads(options: UseMediaLibraryUploadsOptions) {
  const { folder, view, fetchLibrary, t } = options
  const preview = useUploadPreview()
  const variantWatch = useVariantWatch()
  const { message: announcement, announce } = useAnnouncer()

  function onReady(item: UploadItem) {
    if (!item.result?.contentType?.startsWith('image/')) return
    variantWatch.track(item.result.id, {
      onReady: () => announce(t('media.tile.announceReady', { name: item.filename })),
      onFailed: () => announce(t('media.tile.announceFailed', { name: item.filename })),
    })
  }

  const upload = useMediaUpload({
    onQueued: (item) => { void preview.generate(item.id, item.file) },
    onReady,
    onSettled: ({ stopped }) => {
      if (stopped) { variantWatch.pause(); return }
      const settledFolder = folder.value
      void fetchLibrary().then(() => tiles.markSettled(settledFolder))
    },
  })
  const tiles = useUploadTiles({ queue: upload.queue, view, folder, preview, dismiss: upload.dismiss })

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
    onDismissUpload: tiles.onDismissUpload,
    previewFor: preview.previewFor,
    variantResults: variantWatch.results,
    stalledIds: variantWatch.stalled,
    track: variantWatch.track,
    followUp,
  }
}
