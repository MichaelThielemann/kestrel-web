import { ref, computed, getCurrentScope, onScopeDispose } from 'vue'
import type { MediaItem, Provenance } from '#kestrel-admin/types/api'
import { upload } from '#kestrel-admin/actions/media'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { PendingUpload } from '../utils/dnd'
import { humanizeSize } from '../utils/library'
import { exceedsUploadLimit } from '../utils/upload-limit'
import { createUploadQueue, isRetryable, summarizeUploads, type QueueEntry, type QueueStatus } from '../utils/upload-queue'
import { useUploadLimit } from './useUploadLimit'
import { useUploadTransport } from './useUploadTransport'

export type UploadStatus = QueueStatus

export interface UploadItem extends QueueEntry {
  file: File; filename: string; folder: string
  provenance?: Provenance
  totalKnown?: boolean
  result?: MediaItem
}

export interface UploadCallbacks {
  onQueued?: (item: UploadItem) => void

  onReady?: (item: UploadItem) => void

  /** Called when the queue is idle; `stopped` when an expired session ended the run. */
  onSettled?: (run: { stopped: boolean }) => void

  onError?: (item: UploadItem) => void
}

export interface UseMediaUploadOptions extends UploadCallbacks {
  /** Uploads that run at the same time; 1 when unset. */
  concurrency?: number
}

export function uploadFailed(item: Pick<UploadItem, 'status'>): boolean {
  return item.status === 'failed'
}

export function useMediaUpload(options: UseMediaUploadOptions = {}) {
  const deps = useActionDeps()
  const transport = useUploadTransport()
  const queue = ref<UploadItem[]>([])
  const { maxUploadBytes, limitError, ensure: ensureUploadLimit } = useUploadLimit()
  let seq = 0

  const summary = computed(() => summarizeUploads(queue.value))
  const active = computed(() => summary.value.queued + summary.value.active > 0)
  const counts = computed(() => ({ total: summary.value.total, done: summary.value.done, failed: summary.value.failed }))

  function notifySettled(item: UploadItem) {
    if (item.status === 'done') options.onReady?.(item)
    else if (uploadFailed(item)) options.onError?.(item)
  }

  const runner = createUploadQueue<UploadItem>({
    items: () => queue.value,
    concurrency: options.concurrency,
    upload: async (item, signal) => {
      const result = await runAction(upload, { deps, item, provenance: item.provenance, transport, signal })
      toastUnexpected(deps, result)
    },
    failUnexpected: (item) => { item.message = deps.t('media.uploadFailedReason') },
    stopOn: (item) => item.code === 'UNAUTHENTICATED',
    onItemSettled: notifySettled,
    onIdle: (run) => options.onSettled?.(run),
  })
  let disposed = false
  if (getCurrentScope()) onScopeDispose(() => { disposed = true; runner.dispose() })

  const unsettled = (i: UploadItem) => i.status === 'queued' || i.status === 'uploading' || i.status === 'processing'

  function clearFinished() {
    queue.value = queue.value.filter(unsettled)
  }

  function clearForNewBatch() {
    queue.value = queue.value.filter((i) => unsettled(i) || (i.status === 'failed' && isRetryable(i)))
  }

  function addItem(pending: PendingUpload, provenance: Provenance | undefined, max: number | null): UploadItem {
    const item: UploadItem = { id: `u${++seq}`, file: pending.file, filename: pending.file.name, folder: pending.folder, provenance, status: 'queued', progress: 0 }
    if (max !== null && exceedsUploadLimit(pending.file.size, max)) {
      item.status = 'failed'
      item.code = 'TOO_LARGE'
      item.message = deps.t('media.upload.tooLargeShort', { size: humanizeSize(pending.file.size), limit: humanizeSize(max) })
    }
    queue.value.push(item)
    return queue.value[queue.value.length - 1]!
  }

  function safely(callback: () => void) {
    try {
      callback()
    } catch (error) {
      console.error(error)
    }
  }

  async function enqueueUploads(uploads: PendingUpload[], provenance?: Provenance) {
    await ensureUploadLimit()
    if (disposed) return
    if (!active.value) clearForNewBatch()
    const added = uploads.map((u) => addItem(u, provenance, maxUploadBytes.value))
    for (const item of added) {
      if (item.status === 'queued') safely(() => options.onQueued?.(item))
      else safely(() => notifySettled(item))
    }
    await runner.start()
  }

  function enqueue(files: File[], folder: string, provenance?: Provenance) {
    return enqueueUploads(files.map((file) => ({ file, folder })), provenance)
  }

  function reset() {
    runner.cancel()
    queue.value = []
  }

  function dismiss(id: string) {
    const index = queue.value.findIndex((i) => i.id === id)
    if (index !== -1) queue.value.splice(index, 1)
  }

  return {
    queue, active, counts, summary, limitError, maxUploadBytes, ensureUploadLimit,
    enqueue, enqueueUploads, reset, dismiss, clearFinished,
    retry: runner.retry, retryFailed: runner.retryFailed, cancel: runner.cancel, canRetry: isRetryable,
  }
}
