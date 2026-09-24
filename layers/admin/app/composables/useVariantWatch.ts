import { computed, onUnmounted, ref } from 'vue'
import type { MediaItem, MediaVariant, MediaVariantCounts } from '#kestrel-admin/types/api'
import { apiErrorStatus } from './useApi'

export interface VariantWatchEntry { variants: readonly MediaVariant[]; variantCounts: MediaVariantCounts }

export interface VariantTrackCallbacks { onReady?: () => void; onFailed?: () => void }

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
  const hasPending = computed(() => tracked.value.size > 0)
  const callbacks = new Map<string, VariantTrackCallbacks>()

  let step = 0
  let lastChangeAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  let visibilityHandler: (() => void) | null = null
  let disposed = false

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
    if (disposed) return
    if (tracked.value.size === 0) return
    if (import.meta.client && document.hidden) return
    timer = setTimeout(() => { void poll() }, ms)
  }

  async function poll(): Promise<void> {
    if (tracked.value.size === 0) return
    const ids = [...tracked.value].slice(0, MAX_IDS_PER_CALL)
    try {
      const page = await api<{ items: MediaItem[] }>('/media', { query: { ids: ids.join(','), locale: primary.value } })
      if (disposed) return
      let changed = false
      for (const item of page.items) {
        const previous = results.value.get(item.id)
        if (!previous || previous.variantCounts.pending !== item.variantCounts.pending) changed = true
        results.value.set(item.id, { variants: item.variants, variantCounts: item.variantCounts })
        if (item.variantCounts.pending === 0) {
          tracked.value.delete(item.id)
          const cbs = callbacks.get(item.id)
          callbacks.delete(item.id)
          const counts = item.variantCounts
          if (counts.error + counts.failed > 0) cbs?.onFailed?.()
          else cbs?.onReady?.()
        }
      }
      if (changed) { step = 0; lastChangeAt = Date.now() }
    } catch (e) {
      if (disposed) return
      if (apiErrorStatus(e) === 401) { tracked.value.clear(); return }
    }
    if (tracked.value.size > 0 && Date.now() - lastChangeAt > STALL_AFTER_MS) {
      for (const id of tracked.value) stalled.value.add(id)
      tracked.value.clear()
      return
    }
    schedule(nextDelay())
  }

  function track(id: string, cbs?: VariantTrackCallbacks) {
    if (!has('images')) return
    stalled.value.delete(id)
    if (cbs) callbacks.set(id, cbs)
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
    disposed = true
    clearTimer()
    callbacks.clear()
    if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
  })

  return { track, entryFor, isStalled, hasPending, results, stalled }
}
