import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { StaleStatus } from '#kestrel-admin/types/api'

const POLL_MS = 2000

export interface StaleProgress { done: number, total: number, percent: number }

/**
 * The static delivery's re-render backlog (`GET /admin/publish-status/pages`): loaded on mount, then polled every
 * two seconds while pages wait, paused while the document is hidden. `progress` counts from the largest backlog
 * seen since it last reached zero, or from the number `watch()` was told was just queued.
 */
export function useStaleStatus() {
  const api = useAdminApi()
  const capabilities = useCapabilities()

  const status = ref<StaleStatus | null>(null)
  const loadError = ref<string | null>(null)
  const total = ref(0)
  const available = computed(() => capabilities.has('pagesStaleStatus'))

  let timer: ReturnType<typeof setTimeout> | null = null
  let onVisibility: (() => void) | null = null
  let disposed = false

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

  async function tick(): Promise<void> {
    clearTimer()
    await load()
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

  return { status, loadError, available, progress, watch }
}
