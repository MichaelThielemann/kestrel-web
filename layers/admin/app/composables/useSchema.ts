import { LAYER_ROUTES } from '#kestrel-core/fixed-routes'
import type { AdminSchema } from '#kestrel-admin/types/api'
import type { ApiClient, ApiRequestOptions } from '../actions/types'
import type { ApiRoute } from '../utils/capabilities'
import { apiErrorMessage, apiErrorStatus, useApi } from './useApi'

export type SchemaOutcome = 'ok' | 'unauthenticated' | 'failed'

export interface SchemaState {
  schema: AdminSchema | null
  error: string | null
  generation: number
}

export const SCHEMA_STATE_KEY = 'kestrel-schema'

const MIN_REFRESH_INTERVAL_MS = 1000

interface FetchResult { outcome: SchemaOutcome; schema: AdminSchema | null; error: string | null }

async function fetchSchema(api: ApiClient): Promise<FetchResult> {
  try {
    const schema = await api<AdminSchema>(LAYER_ROUTES.schema)
    return { outcome: 'ok', schema, error: null }
  } catch (e) {
    if (apiErrorStatus(e) === 401) return { outcome: 'unauthenticated', schema: null, error: null }
    return { outcome: 'failed', schema: null, error: apiErrorMessage(e) }
  }
}

const loadInFlight = new WeakMap<object, Promise<SchemaOutcome>>()

export function loadSchemaInto(state: { value: SchemaState }, api: ApiClient, scope: object): Promise<SchemaOutcome> {
  if (state.value.schema) return Promise.resolve('ok')
  const running = loadInFlight.get(scope)
  if (running) return running
  const generation = state.value.generation
  const load = fetchSchema(api).then((result) => {
    if (state.value.generation !== generation) return 'ok' as const
    state.value = { schema: result.schema, error: result.error, generation }
    return result.outcome
  }).finally(() => { loadInFlight.delete(scope) })
  loadInFlight.set(scope, load)
  return load
}

const refreshInFlight = new WeakMap<object, Promise<SchemaOutcome>>()
const lastRefreshedAt = new WeakMap<object, number>()

/**
 * Refetches without ever blanking the schema the caller is currently using: the old capabilities
 * stay in effect until the new answer replaces them in one assignment, so a gated view never loses
 * its schema (and unmounts) just because a refresh is in flight. A failed refetch keeps serving the
 * stale schema rather than clearing it; only a real 401 clears (the session itself is gone).
 */
export function refreshSchemaInto(state: { value: SchemaState }, api: ApiClient, scope: object): Promise<SchemaOutcome> {
  const running = refreshInFlight.get(scope)
  if (running) return running

  const lastAt = lastRefreshedAt.get(scope) ?? 0
  if (Date.now() - lastAt < MIN_REFRESH_INTERVAL_MS) return Promise.resolve('ok')

  const generation = state.value.generation
  const refresh = fetchSchema(api).then((result) => {
    lastRefreshedAt.set(scope, Date.now())
    if (state.value.generation !== generation) return 'ok' as const
    if (result.outcome === 'unauthenticated') state.value = { schema: null, error: null, generation }
    else if (result.outcome === 'ok') state.value = { schema: result.schema, error: null, generation }
    return result.outcome
  }).finally(() => { refreshInFlight.delete(scope) })
  refreshInFlight.set(scope, refresh)
  return refresh
}

export function useSchema() {
  const state = useState<SchemaState>(SCHEMA_STATE_KEY, () => ({ schema: null, error: null, generation: 0 }))
  const rawApi = useApi()
  const api: ApiClient = <T,>(route: ApiRoute, options?: ApiRequestOptions): Promise<T> => rawApi<T>(route.path, { ...options, method: route.method })
  const scope = useNuxtApp()

  function clear(): void {
    state.value = { schema: null, error: null, generation: state.value.generation + 1 }
  }

  return {
    schema: computed(() => state.value.schema),
    error: computed(() => state.value.error),
    load: () => loadSchemaInto(state, api, scope),
    clear,
    refresh: (): Promise<SchemaOutcome> => refreshSchemaInto(state, api, scope),
  }
}
