import { computed, onMounted, onUnmounted } from 'vue'
import type { EventDeliveryStatus } from '#kestrel-admin/types/api'

const POLL_MS = 30_000

export interface DeadLetterCountOptions {
  /** Load on mount and poll while the document is visible. Pass `false` to read and refresh the shared count without a timer of its own. Defaults to `true`. */
  poll?: boolean
}

/**
 * The number of background events that gave up after their last attempt, for the admin rail. It is the `dead` count of
 * `GET /admin/events/delivery`, and only while the status is scoped to the persistent queue (`scope: "store"`): a count
 * for this process alone cannot be lowered by a retry, so it stays 0. Without the `eventsDeliveryStatus` capability no
 * request is sent. The value is shared by every caller, and only the answer to the latest load is applied; a failed load
 * keeps the last value and raises nothing. With polling, it loads on mount, every 30 seconds while the document is
 * visible, and once when the document becomes visible again; the timer and the listener end with the component.
 */
export function useDeadLetterCount(options: DeadLetterCountOptions = {}) {
  const poll = options.poll ?? true
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const dead = useState<number>('kestrel-admin-dead-letter-count', () => 0)
  const latest = useState<number>('kestrel-admin-dead-letter-seq', () => 0)
  const available = computed(() => capabilities.has('eventsDeliveryStatus'))

  let timer: ReturnType<typeof setTimeout> | null = null
  let onVisibility: (() => void) | null = null
  let disposed = false
  let inFlight: Promise<void> | null = null

  function clearTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  async function load(): Promise<void> {
    const seq = ++latest.value
    if (!available.value) {
      dead.value = 0
      return
    }
    try {
      const status = await api<EventDeliveryStatus>(capabilities.route('eventsDeliveryStatus'))
      if (seq !== latest.value) return
      dead.value = status.scope === 'store' ? status.dead : 0
    } catch {
      return
    }
  }

  function refresh(): Promise<void> {
    inFlight ??= load().finally(() => { inFlight = null })
    return inFlight
  }

  function schedule(): void {
    clearTimer()
    if (disposed || document.hidden) return
    timer = setTimeout(() => { void tick() }, POLL_MS)
  }

  async function tick(): Promise<void> {
    clearTimer()
    await refresh()
    schedule()
  }

  if (poll) {
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
  }

  return { count: computed(() => dead.value), refresh }
}
