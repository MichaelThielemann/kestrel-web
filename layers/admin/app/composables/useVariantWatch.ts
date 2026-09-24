import { computed, onUnmounted, ref } from 'vue'
import type { MediaItem, MediaVariant, MediaVariantCounts } from '#kestrel-admin/types/api'

export interface VariantWatchEntry { variants: readonly MediaVariant[]; variantCounts: MediaVariantCounts }

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000]
const STEADY_POLL_MS = 10000
const STALL_AFTER_MS = 10 * 60 * 1000
const MAX_IDS_PER_CALL = 200

export function useVariantWatch() {
  const api = useApi()
  const { has } = useFeatures()
  const { primary } = useContentLocales()

  const results = ref<Map<string, VariantWatchEntry>>(new Map())
  const stalled = ref<Set<string>>(new Set())
  const tracked = ref<Set<string>>(new Set())
  const hasPending = computed(() => tracked.value.size > 0 || [...results.value.values()].some((e) => e.variantCounts.pending > 0))

  let step = 0
  let lastChangeAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  let visibilityHandler: (() => void) | null = null

  function nextDelay(): number {
    const delay = BACKOFF_STEPS_MS[step] ?? STEADY_POLL_MS
    if (step < BACKOFF_STEPS_MS.length) step++
    return delay
  }

  function clearTimer() {
    if (timer !== null) { clearTimeout(timer); timer = null }
  }

  function schedule(ms: number) {
    clearTimer()
    if (tracked.value.size === 0) return
    if (import.meta.client && document.hidden) return
    timer = setTimeout(() => { void poll() }, ms)
  }

  async function poll(): Promise<void> {
    if (tracked.value.size === 0) return
    const ids = [...tracked.value].slice(0, MAX_IDS_PER_CALL)
    try {
      const page = await api<{ items: MediaItem[] }>('/media', { query: { ids: ids.join(','), locale: primary.value } })
      let changed = false
      for (const item of page.items) {
        const previous = results.value.get(item.id)
        if (!previous || previous.variantCounts.pending !== item.variantCounts.pending) changed = true
        results.value.set(item.id, { variants: item.variants, variantCounts: item.variantCounts })
        if (item.variantCounts.pending === 0) tracked.value.delete(item.id)
      }
      if (changed) { step = 0; lastChangeAt = Date.now() }
    }
    // eslint-disable-next-line no-empty
    catch {}
    if (tracked.value.size > 0 && Date.now() - lastChangeAt > STALL_AFTER_MS) {
      for (const id of tracked.value) stalled.value.add(id)
      tracked.value.clear()
      return
    }
    schedule(nextDelay())
  }

  function track(id: string) {
    if (!has('images')) return
    stalled.value.delete(id)
    if (tracked.value.has(id)) return
    tracked.value.add(id)
    step = 0
    lastChangeAt = Date.now()
    schedule(0)
  }

  function entryFor(id: string): VariantWatchEntry | undefined {
    return results.value.get(id)
  }

  function isStalled(id: string): boolean {
    return stalled.value.has(id)
  }

  if (import.meta.client) {
    visibilityHandler = () => { if (!document.hidden) schedule(0) }
    document.addEventListener('visibilitychange', visibilityHandler, { passive: true })
  }

  onUnmounted(() => {
    clearTimer()
    if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
  })

  return { track, entryFor, isStalled, hasPending, results, stalled }
}
