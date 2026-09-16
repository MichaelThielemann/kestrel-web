import type { InsightsManifest, InsightsStats } from '#kestrel-admin/types/api'

export type InsightsAvailability = 'unknown' | 'ok' | 'notFound' | 'forbidden' | 'error'

interface InsightsState {
  manifest: InsightsManifest | null
  stats: InsightsStats | null
  availability: InsightsAvailability
  error: string | null
  statsError: string | null
}

export function availabilityOf(status: number, code: string): InsightsAvailability {
  if (status === 404 || code === 'NOT_FOUND') return 'notFound'
  if (status === 403 || code === 'FORBIDDEN') return 'forbidden'
  return 'error'
}

export function useInsights() {
  const api = useApi()
  const state = useState<InsightsState>('kestrel-insights', () => ({ manifest: null, stats: null, availability: 'unknown', error: null, statsError: null }))

  function fail(e: unknown) {
    state.value.availability = availabilityOf(apiErrorStatus(e), apiErrorCode(e))
    state.value.error = apiErrorMessage(e)
  }

  async function loadManifest(force = false): Promise<InsightsManifest | null> {
    if (state.value.manifest && !force) return state.value.manifest
    try {
      const m = await api<InsightsManifest>('/admin/insights/manifest')
      state.value.manifest = m
      state.value.availability = 'ok'
      state.value.error = null
      return m
    } catch (e) {
      fail(e)
      return null
    }
  }

  async function loadStats(): Promise<InsightsStats | null> {
    try {
      const s = await api<InsightsStats>('/admin/insights/stats')
      state.value.stats = s
      state.value.statsError = null
      return s
    } catch (e) {
      if (state.value.availability !== 'ok') {
        fail(e)
      } else {
        state.value.statsError = apiErrorMessage(e)
      }
      return null
    }
  }

  const manifest = computed(() => state.value.manifest)
  const stats = computed(() => state.value.stats)
  const modules = computed(() => state.value.manifest?.modules ?? [])
  const moduleByName = computed(() => new Map(modules.value.map((m) => [m.name, m])))

  return {
    manifest,
    stats,
    modules,
    moduleByName,
    availability: computed(() => state.value.availability),
    error: computed(() => state.value.error),
    statsError: computed(() => state.value.statsError),
    loadManifest,
    loadStats,
  }
}
