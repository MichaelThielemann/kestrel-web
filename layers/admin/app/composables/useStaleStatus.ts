import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { StaleStatus } from '#kestrel-admin/types/api'
import { staleAnnouncement } from '../utils/stale-messages'

const POLL_MS = 2000

export interface StaleProgress { done: number, total: number, percent: number }

/**
 * The static delivery's re-render backlog (`GET /admin/publish-status/pages`): loaded on mount, then polled every
 * two seconds while pages wait, paused while the document is hidden, with at most one request in flight; a load
 * asked for while one runs follows it. `progress` counts from the largest backlog seen since it last reached zero,
 * or from the number `watch()` was told was just queued. `announcement` changes only when pages start waiting, a
 * re-render fails or the backlog ends, so a polite live region reading it is not repeated on every poll.
 */
export function useStaleStatus() {
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const { t } = useT()

  const status = ref<StaleStatus | null>(null)
  const loadError = ref<string | null>(null)
  const announcement = ref('')
  const total = ref(0)
  const available = computed(() => capabilities.has('pagesStaleStatus'))

  let timer: ReturnType<typeof setTimeout> | null = null
  let onVisibility: (() => void) | null = null
  let disposed = false
  let inFlight: Promise<void> | null = null
  let again = false

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
      announcement.value = staleAnnouncement(t, status.value, next) ?? announcement.value
      status.value = next
      loadError.value = null
      total.value = next.stale === 0 ? 0 : Math.max(total.value, next.stale)
    } catch (e) {
      if (!disposed) loadError.value = apiErrorMessage(e)
    }
  }

  function schedule(): void {
    clearTimer()
    if (disposed || document.hidden || (status.value?.stale ?? 0) === 0) return
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

  return { status, loadError, announcement, available, progress, watch }
}
