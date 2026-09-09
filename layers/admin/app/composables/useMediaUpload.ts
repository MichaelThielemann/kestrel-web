import { ref, computed } from 'vue'
import type { Provenance } from '#kestrel-admin/types/api'
import { upload } from '#kestrel-admin/actions/media'
import type { ActionDeps } from '#kestrel-admin/actions/types'
import type { PendingUpload } from '../utils/dnd'
import { humanizeSize } from '../utils/library'
import { exceedsUploadLimit } from '../utils/upload-limit'

export interface UploadItem {
  id: string; file: File; filename: string; folder: string
  status: 'queued' | 'uploading' | 'done' | 'error'
  message?: string
}

export interface UploadCallbacks {
  onSettled?: () => void

  onError?: (item: UploadItem) => void
}

export function uploadFailed(item: Pick<UploadItem, 'status' | 'message'>): boolean {
  return item.status === 'error' && item.message !== undefined
}

function useUploadLimit() {
  const api = useApi()
  const maxUploadBytes = useState<number | null>('kestrel-upload-limit', () => null)
  const fetched = useState<boolean>('kestrel-upload-limit-fetched', () => false)

  async function ensure() {
    if (fetched.value) return
    fetched.value = true
    try {
      const r = await api<{ maxUploadBytes: number | null }>('/limits')
      maxUploadBytes.value = r.maxUploadBytes
    } catch {
      maxUploadBytes.value = null
    }
  }

  return { maxUploadBytes, ensure }
}

export function useMediaUpload(cb: UploadCallbacks = {}) {
  const api = useApi()
  const { t } = useT()
  const toast = useToast()
  const queue = ref<UploadItem[]>([])
  const { maxUploadBytes, ensure: ensureUploadLimit } = useUploadLimit()
  let seq = 0
  const active = computed(() => queue.value.some((i) => i.status === 'queued' || i.status === 'uploading'))
  const counts = computed(() => ({
    total: queue.value.length,
    done: queue.value.filter((i) => i.status === 'done').length,
    error: queue.value.filter((i) => i.status === 'error').length,
  }))

  function deps(): ActionDeps {
    return { api, t, toast }
  }

  async function uploadItem(item: UploadItem, provenance?: Provenance) {
    await runAction(upload, { deps: deps(), item, provenance })
    if (uploadFailed(item)) cb.onError?.(item)
  }

  async function enqueueUploads(uploads: PendingUpload[], provenance?: Provenance) {
    await ensureUploadLimit()
    const max = maxUploadBytes.value
    const added: UploadItem[] = []
    for (const u of uploads) {
      const item: UploadItem = { id: `u${++seq}`, file: u.file, filename: u.file.name, folder: u.folder, status: 'queued' }
      if (exceedsUploadLimit(u.file.size, max)) {
        item.status = 'error'
        item.message = t('upload.tooLarge', { size: humanizeSize(u.file.size), limit: humanizeSize(max as number) })
      }
      queue.value.push(item)
      added.push(item)
    }
    for (const item of added) {
      if (item.status === 'queued') await uploadItem(item, provenance)
      else if (uploadFailed(item)) cb.onError?.(item)
    }
    cb.onSettled?.()
  }

  function enqueue(files: File[], folder: string, provenance?: Provenance) {
    return enqueueUploads(files.map((file) => ({ file, folder })), provenance)
  }

  function reset() { queue.value = [] }

  return { queue, active, counts, enqueue, enqueueUploads, reset }
}
