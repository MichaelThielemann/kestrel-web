import { ref, computed } from 'vue'
import { LAYER_ROUTES } from '#kestrel-core/fixed-routes'
import type { MediaItem, Provenance } from '#kestrel-admin/types/api'
import { upload } from '#kestrel-admin/actions/media'
import type { ActionDeps, Translate } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { PendingUpload } from '../utils/dnd'
import { humanizeSize } from '../utils/library'
import { exceedsUploadLimit } from '../utils/upload-limit'
import { apiErrorMessage } from './useApi'
import { useAdminApi } from './useAdminApi'
import { useCapabilities } from './useCapabilities'
import { useUploadTransport } from './useUploadTransport'

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'failed'

export interface UploadItem {
  id: string; file: File; filename: string; folder: string
  status: UploadStatus
  progress: number
  totalKnown?: boolean
  message?: string
  result?: MediaItem
}

export interface UploadCallbacks {
  onQueued?: (item: UploadItem) => void

  onReady?: (item: UploadItem) => void

  onSettled?: () => void

  onError?: (item: UploadItem) => void
}

export function uploadFailed(item: Pick<UploadItem, 'status' | 'message'>): boolean {
  return item.status === 'failed' && item.message !== undefined
}

export interface UploadStatusInputs { active: boolean; done: number; failed: number; processing: boolean; variantsPending: boolean }

export function uploadStatusLine(inputs: UploadStatusInputs, t: Translate): string {
  const parts: string[] = []
  if (inputs.active) {
    const failed = inputs.failed ? `, ${inputs.failed} ${t('media.uploadFailed')}` : ''
    parts.push(`${t('media.uploading')}${inputs.done} ${t('media.uploadUploaded')}${failed}`)
  }
  if (inputs.processing) parts.push(t('media.tile.processing'))
  else if (inputs.variantsPending) parts.push(t('media.upload.processing'))
  return parts.join(' · ')
}

export interface UploadLimitState {
  maxUploadBytes: number | null
  fetched: boolean
  limitError: string | null
}

export type LimitFetchOutcome =
  | { ok: true, maxUploadBytes: number | null }
  | { ok: false, message: string }

export function nextLimitState(previous: UploadLimitState, outcome: LimitFetchOutcome): UploadLimitState {
  if (outcome.ok) return { maxUploadBytes: outcome.maxUploadBytes, fetched: true, limitError: null }
  return { ...previous, limitError: outcome.message }
}

function useUploadLimit() {
  const api = useAdminApi()
  const maxUploadBytes = useState<number | null>('kestrel-upload-limit', () => null)
  const fetched = useState<boolean>('kestrel-upload-limit-fetched', () => false)
  const limitError = useState<string | null>('kestrel-upload-limit-error', () => null)

  async function ensure() {
    if (fetched.value) return
    let outcome: LimitFetchOutcome
    try {
      const r = await api<{ maxUploadBytes: number | null }>(LAYER_ROUTES.limits)
      outcome = { ok: true, maxUploadBytes: r.maxUploadBytes }
    } catch (e) {
      outcome = { ok: false, message: apiErrorMessage(e) }
    }
    const next = nextLimitState({ maxUploadBytes: maxUploadBytes.value, fetched: fetched.value, limitError: limitError.value }, outcome)
    maxUploadBytes.value = next.maxUploadBytes
    fetched.value = next.fetched
    limitError.value = next.limitError
  }

  return { maxUploadBytes, limitError, ensure }
}

export function useMediaUpload(cb: UploadCallbacks = {}) {
  const api = useAdminApi()
  const { t } = useT()
  const toast = useToast()
  const capabilities = useCapabilities()
  const transport = useUploadTransport()
  const queue = ref<UploadItem[]>([])
  const { maxUploadBytes, limitError, ensure: ensureUploadLimit } = useUploadLimit()
  let seq = 0
  const active = computed(() => queue.value.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'processing'))
  const counts = computed(() => ({
    total: queue.value.length,
    done: queue.value.filter((i) => i.status === 'done').length,
    failed: queue.value.filter((i) => i.status === 'failed').length,
  }))

  function deps(): ActionDeps {
    return { api, t, toast, capabilities }
  }

  async function uploadItem(item: UploadItem, provenance?: Provenance) {
    const d = deps()
    const result = await runAction(upload, { deps: d, item, provenance, transport })
    toastUnexpected(d, result)
    if (uploadFailed(item)) cb.onError?.(item)
    else cb.onReady?.(item)
  }

  async function enqueueUploads(uploads: PendingUpload[], provenance?: Provenance) {
    await ensureUploadLimit()
    const max = maxUploadBytes.value
    const added: UploadItem[] = []
    for (const u of uploads) {
      const item: UploadItem = { id: `u${++seq}`, file: u.file, filename: u.file.name, folder: u.folder, status: 'queued', progress: 0 }
      if (exceedsUploadLimit(u.file.size, max) && max !== null) {
        item.status = 'failed'
        item.message = t('upload.tooLarge', { size: humanizeSize(u.file.size), limit: humanizeSize(max) })
      }
      queue.value.push(item)
      added.push(queue.value[queue.value.length - 1]!)
      if (item.status === 'queued') cb.onQueued?.(item)
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

  function dismiss(id: string) {
    const index = queue.value.findIndex((i) => i.id === id)
    if (index !== -1) queue.value.splice(index, 1)
  }

  return { queue, active, counts, limitError, enqueue, enqueueUploads, reset, dismiss }
}
