import type { AdminSchema } from '#kestrel-admin/types/api'
import type { ApiClient } from '../actions/types'
import { apiErrorMessage, apiErrorStatus } from './useApi'

export type SchemaOutcome = 'ok' | 'unauthenticated' | 'failed'

export interface SchemaState {
  schema: AdminSchema | null
  error: string | null
}

export const SCHEMA_STATE_KEY = 'kestrel-schema'

export const SCHEMA_PATH = '/admin/schema'

const inFlight = new WeakMap<object, Promise<SchemaOutcome>>()

async function fetchSchemaInto(state: { value: SchemaState }, api: ApiClient): Promise<SchemaOutcome> {
  try {
    state.value = { schema: await api<AdminSchema>(SCHEMA_PATH), error: null }
    return 'ok'
  } catch (e) {
    if (apiErrorStatus(e) === 401) {
      state.value = { schema: null, error: null }
      return 'unauthenticated'
    }
    state.value = { schema: null, error: apiErrorMessage(e) }
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
  const state = useState<SchemaState>(SCHEMA_STATE_KEY, () => ({ schema: null, error: null }))
  const api = useApi()
  const scope = useNuxtApp()

  return {
    schema: computed(() => state.value.schema),
    error: computed(() => state.value.error),
    load: () => loadSchemaInto(state, api, scope),
    clear: () => { state.value = { schema: null, error: null } },
  }
}
