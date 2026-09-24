import { LAYER_ROUTES } from '#kestrel-core/fixed-routes'
import type { AdminSchema } from '#kestrel-admin/types/api'
import type { ApiClient } from '../actions/types'
import { apiErrorMessage, apiErrorStatus } from './useApi'
import { useAdminApi } from './useAdminApi'

export type SchemaOutcome = 'ok' | 'unauthenticated' | 'failed'

export interface SchemaState {
  schema: AdminSchema | null
  error: string | null
  generation: number
}

export const SCHEMA_STATE_KEY = 'kestrel-schema'

const inFlight = new WeakMap<object, Promise<SchemaOutcome>>()

async function fetchSchemaInto(state: { value: SchemaState }, api: ApiClient): Promise<SchemaOutcome> {
  const generation = state.value.generation
  try {
    const schema = await api<AdminSchema>(LAYER_ROUTES.schema)
    if (state.value.generation !== generation) return 'ok'
    state.value = { schema, error: null, generation }
    return 'ok'
  } catch (e) {
    if (state.value.generation !== generation) return 'ok'
    if (apiErrorStatus(e) === 401) {
      state.value = { schema: null, error: null, generation }
      return 'unauthenticated'
    }
    state.value = { schema: null, error: apiErrorMessage(e), generation }
    return 'failed'
  }
}

export function loadSchemaInto(state: { value: SchemaState }, api: ApiClient, scope: object): Promise<SchemaOutcome> {
  if (state.value.schema) return Promise.resolve('ok')
  const running = inFlight.get(scope)
  if (running) return running
  const load = fetchSchemaInto(state, api).finally(() => { inFlight.delete(scope) })
  inFlight.set(scope, load)
  return load
}

export function useSchema() {
  const state = useState<SchemaState>(SCHEMA_STATE_KEY, () => ({ schema: null, error: null, generation: 0 }))
  const api = useAdminApi()
  const scope = useNuxtApp()

  function clear(): void {
    state.value = { schema: null, error: null, generation: state.value.generation + 1 }
  }

  return {
    schema: computed(() => state.value.schema),
    error: computed(() => state.value.error),
    load: () => loadSchemaInto(state, api, scope),
    clear,
    refresh: (): Promise<SchemaOutcome> => {
      clear()
      return loadSchemaInto(state, api, scope)
    },
  }
}
