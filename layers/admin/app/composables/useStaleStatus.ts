import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { StaleStatus } from '#kestrel-admin/types/api'
import { staleAnnouncement } from '../utils/stale-messages'
import { exportAnnouncement, exportFormat, exportsRecordedSince, type IndexFiles } from '../utils/export-messages'
import { INDEX_EXPORT_DELAYS } from '#kestrel-core/pipelines/index-delays'

const POLL_MS = 2000
const EXPORT_WAIT_MS = 60_000
const INDEX_TAIL_MS = INDEX_EXPORT_DELAYS.refreshIndexes + 2 * POLL_MS

type ExportId = keyof StaleStatus['exports']

interface ExportWait { since: StaleStatus['exports'], ids: ExportId[], until: number }

export interface StaleProgress { done: number, total: number, percent: number }

/**
 * The static delivery's re-render backlog (`GET /admin/publish-status/pages`): loaded on mount, then polled every
 * two seconds while pages wait; after `watch()` until the index export and, while `files.llmsFull` is on, the
 * llms-full.txt export show a newer outcome than the status `watch()` started from, for at most a minute. A drained
 * backlog replaces that wait: while `files.llmsFull` is on, until llms-full.txt, which trails the re-renders, shows
 * an outcome newer than the drain, for at most a minute; otherwise until the index export a last re-render may ask
 * for does, for at most a few seconds. Paused while the document is hidden, with at most one request in flight; a load asked for while one runs follows
 * it. `progress` counts from the largest backlog seen since it last reached zero, or from the number `watch()` was
 * told was just queued. `announcement` changes only when pages start waiting, a re-render fails, the backlog ends
 * or an export fails or is skipped: the first outcome of each export after `watch()` and after a drained backlog, and
 * any later one only when it starts to fail or to be skipped or fails with another error, so a polite live region
 * reading it is not repeated on every poll.
 */
export function useStaleStatus() {
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const { t, lang } = useT()
  const { schema } = useSchema()

  const status = ref<StaleStatus | null>(null)
  const loadError = ref<string | null>(null)
  const announcement = ref('')
  const total = ref(0)
  const available = computed(() => capabilities.has('pagesStaleStatus'))
  const files = computed<IndexFiles>(() => ({ sitemap: schema.value?.sitemap === true, robots: schema.value?.robots === true, llmsFull: schema.value?.llmsFull === true }))

  let timer: ReturnType<typeof setTimeout> | null = null
  let onVisibility: (() => void) | null = null
  let disposed = false
  let inFlight: Promise<void> | null = null
  let again = false
  let exportWait: ExportWait | null = null

  const progress = computed<StaleProgress | null>(() => {
    const stale = status.value?.stale ?? 0
    if (stale === 0 || total.value === 0) return null
    const done = Math.max(0, total.value - stale)
    return { done, total: total.value, percent: Math.round((done / total.value) * 100) }
  })

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function load(): Promise<void> {
    if (!available.value) return
    try {
      const next = await api<StaleStatus>(capabilities.route('pagesStaleStatus'))
      if (disposed) return
      const previous = status.value
      if (exportWait !== null && Date.now() >= exportWait.until) exportWait = null
      const said = [staleAnnouncement(t, previous, next), exportAnnouncement(t, previous?.exports ?? null, next.exports, exportFormat(lang.value), files.value, exportWait?.since ?? null)].filter((text) => text !== null)
      if (said.length > 0) announcement.value = said.join(' ')
      if (previous !== null && previous.stale > 0 && next.stale === 0) {
        exportWait = files.value.llmsFull
          ? { since: next.exports, ids: ['llmsFull'], until: Date.now() + EXPORT_WAIT_MS }
          : { since: next.exports, ids: ['indexes'], until: Date.now() + INDEX_TAIL_MS }
      }
      if (exportWait !== null && exportsRecordedSince(exportWait.since, next.exports, exportWait.ids)) exportWait = null
      status.value = next
      loadError.value = null
      total.value = next.stale === 0 ? 0 : Math.max(total.value, next.stale)
    } catch (e) {
      if (!disposed) loadError.value = apiErrorText(t, e, t('delivery.staleLoadError'))
    }
  }

  function schedule(): void {
    clearTimer()
    if (disposed || document.hidden || ((status.value?.stale ?? 0) === 0 && (exportWait === null || Date.now() >= exportWait.until))) return
    timer = setTimeout(() => { void tick() }, POLL_MS)
  }

  async function drain(): Promise<void> {
    do {
      again = false
      await load()
    } while (again && !disposed)
  }

  async function tick(): Promise<void> {
    clearTimer()
    if (inFlight) {
      again = true
      return inFlight
    }
    inFlight = drain()
    try {
      await inFlight
    } finally {
      inFlight = null
    }
    schedule()
  }

  async function watch(queued?: number): Promise<void> {
    if (queued !== undefined && queued > 0) total.value = Math.max(total.value, queued)
    exportWait = { since: status.value?.exports ?? { indexes: null, llmsFull: null }, ids: files.value.llmsFull ? ['indexes', 'llmsFull'] : ['indexes'], until: Date.now() + EXPORT_WAIT_MS }
    await tick()
  }

  onMounted(() => {
    onVisibility = () => {
      if (document.hidden) clearTimer()
      else void tick()
    }
    document.addEventListener('visibilitychange', onVisibility, { passive: true })
    void tick()
  })

  onUnmounted(() => {
    disposed = true
    clearTimer()
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
    onVisibility = null
  })

  return { status, loadError, announcement, available, progress, files, watch }
}
