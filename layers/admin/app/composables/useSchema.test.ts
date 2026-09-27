import { describe, expect, it, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { LAYER_ROUTES } from '#kestrel-core/fixed-routes'
import type { ApiClient } from '../actions/types'
import type { ApiRoute } from '../utils/capabilities'
import { loadSchemaInto, refreshSchemaInto, type SchemaOutcome, type SchemaState } from './useSchema'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: ['delivery'],
  capabilities: {},
}

const updatedSchema: AdminSchema = { ...schema, features: ['delivery', 'references'] }

function fakeState(generation = 0): { value: SchemaState } {
  return { value: { schema: null, error: null, generation } }
}

function scope(): object {
  return {}
}

function fakeApi(answer: unknown | Error) {
  const routes: ApiRoute[] = []
  const api: ApiClient = <T>(route: ApiRoute): Promise<T> => {
    routes.push(route)
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(boundaryCast<T>(answer, 'json'))
  }
  return { api, routes }
}

const apiError = (status: number, message: string) =>
  Object.assign(new Error(message), { status, name: 'ApiError', data: { error: message, code: 'INTERNAL', retryable: false } })

describe('loadSchemaInto', () => {
  it('marks an account the schema route refuses with 403 as without access, not as a failure', async () => {
    const state = fakeState()
    const { api } = fakeApi(apiError(403, 'this account has no role'))

    expect(await loadSchemaInto(state, api, scope())).toBe('forbidden')
    expect(state.value.forbidden).toBe(true)
    expect(state.value.error).toBeNull()
    expect(state.value.schema).toBeNull()
  })

  it('requests the schema once and keeps it for the rest of the session', async () => {
    const state = fakeState()
    const { api, routes } = fakeApi(schema)

    expect(await loadSchemaInto(state, api, scope())).toBe('ok')
    expect(await loadSchemaInto(state, api, scope())).toBe('ok')

    expect(routes).toEqual([LAYER_ROUTES.schema])
    expect(state.value.schema).toEqual(schema)
    expect(state.value.error).toBeNull()
  })

  it('requests it again after the state was cleared', async () => {
    const state = fakeState()
    const { api, routes } = fakeApi(schema)

    await loadSchemaInto(state, api, scope())
    state.value = { schema: null, error: null, generation: state.value.generation + 1 }
    await loadSchemaInto(state, api, scope())

    expect(routes).toEqual([LAYER_ROUTES.schema, LAYER_ROUTES.schema])
  })

  it('reports a 401 as an invalid session and leaves no error behind', async () => {
    const state = fakeState()
    const { api } = fakeApi(apiError(401, 'unauthenticated'))

    expect(await loadSchemaInto(state, api, scope())).toBe('unauthenticated')
    expect(state.value.schema).toBeNull()
    expect(state.value.error).toBeNull()
  })

  it('keeps any other failure visible instead of falling back', async () => {
    const state = fakeState()
    const { api } = fakeApi(apiError(503, 'database is busy'))

    expect(await loadSchemaInto(state, api, scope())).toBe('failed')
    expect(state.value.schema).toBeNull()
    expect(state.value.error).toBe('database is busy')
  })

  it('retries after a failure, since nothing was cached', async () => {
    const state = fakeState()
    const failing = fakeApi(apiError(500, 'boom'))
    const succeeding = fakeApi(schema)

    expect(await loadSchemaInto(state, failing.api, scope())).toBe('failed')
    expect(await loadSchemaInto(state, succeeding.api, scope())).toBe('ok')

    expect(succeeding.routes).toEqual([LAYER_ROUTES.schema])
    expect(state.value.error).toBeNull()
  })

  it('shares one request between concurrent loads', async () => {
    const state = fakeState()
    const here = scope()
    const routes: ApiRoute[] = []
    let release: (value: AdminSchema) => void = () => {}
    const api: ApiClient = <T>(route: ApiRoute): Promise<T> => {
      routes.push(route)
      return new Promise<AdminSchema>((resolve) => { release = resolve }).then((value) => boundaryCast<T>(value, 'json'))
    }

    const first = loadSchemaInto(state, api, here)
    const second = loadSchemaInto(state, api, here)
    release(schema)

    expect(await first).toBe('ok')
    expect(await second).toBe('ok')
    expect(routes).toEqual([LAYER_ROUTES.schema])
  })

  it('requests again once the in-flight load has settled', async () => {
    const state = fakeState()
    const here = scope()
    const { api, routes } = fakeApi(apiError(500, 'boom'))

    await Promise.all([loadSchemaInto(state, api, here), loadSchemaInto(state, api, here)])
    await loadSchemaInto(state, api, here)

    expect(routes).toEqual([LAYER_ROUTES.schema, LAYER_ROUTES.schema])
  })

  it('does not touch the network once a schema is present', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const api = vi.fn()

    expect(await loadSchemaInto(state, api, scope())).toBe('ok')
    expect(api).not.toHaveBeenCalled()
  })

  it('discards an answer that arrives after the generation moved on', async () => {
    const state = fakeState()
    const here = scope()
    let release: (value: AdminSchema) => void = () => {}
    const api: ApiClient = <T>(): Promise<T> => new Promise<AdminSchema>((resolve) => { release = resolve }).then((value) => boundaryCast<T>(value, 'json'))

    const load = loadSchemaInto(state, api, here)
    state.value = { schema: null, error: null, generation: state.value.generation + 1 }
    release(schema)
    await load

    expect(state.value.schema).toBeNull()
  })
})

describe('refreshSchemaInto', () => {
  it('keeps the current schema until the new answer arrives, then swaps it in one assignment', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const here = scope()
    let release: (value: AdminSchema) => void = () => {}
    const api: ApiClient = <T>(): Promise<T> => new Promise<AdminSchema>((resolve) => { release = resolve }).then((value) => boundaryCast<T>(value, 'json'))

    const refresh = refreshSchemaInto(state, api, here)
    expect(state.value.schema).toEqual(schema)

    release(updatedSchema)
    expect(await refresh).toBe('ok')
    expect(state.value.schema).toEqual(updatedSchema)
  })

  it('joins one in-flight refresh instead of firing a second request, and both callers see its answer', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const here = scope()
    const { api, routes } = fakeApi(updatedSchema)

    const [first, second] = await Promise.all([refreshSchemaInto(state, api, here), refreshSchemaInto(state, api, here)])

    expect(first).toBe('ok')
    expect(second).toBe('ok')
    expect(routes).toEqual([LAYER_ROUTES.schema])
    expect(state.value.schema).toEqual(updatedSchema)
  })

  it('does not refetch again within the throttle window, so a repeated 403 cannot loop unbounded', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const here = scope()
    const { api, routes } = fakeApi(updatedSchema)

    await refreshSchemaInto(state, api, here)
    await refreshSchemaInto(state, api, here)
    await refreshSchemaInto(state, api, here)

    expect(routes).toEqual([LAYER_ROUTES.schema])
  })

  it('keeps serving the stale schema when the refetch fails', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const here = scope()
    const { api } = fakeApi(apiError(503, 'database is busy'))

    expect(await refreshSchemaInto(state, api, here)).toBe('failed')
    expect(state.value.schema).toEqual(schema)
    expect(state.value.error).toBeNull()
  })

  it('clears the schema on a genuine 401, since the session itself is gone', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const here = scope()
    const { api } = fakeApi(apiError(401, 'unauthenticated'))

    expect(await refreshSchemaInto(state, api, here)).toBe('unauthenticated')
    expect(state.value.schema).toBeNull()
  })

  it('bounds a burst of refetch triggers the way a repeated 403 from a gate outside authz.require would produce', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const here = scope()
    const { api, routes } = fakeApi(updatedSchema)

    const outcomes: SchemaOutcome[] = []
    for (let i = 0; i < 50; i++) outcomes.push(await refreshSchemaInto(state, api, here))

    expect(outcomes.every((outcome) => outcome === 'ok')).toBe(true)
    expect(routes.length).toBeLessThanOrEqual(2)
    expect(state.value.schema).toEqual(updatedSchema)
  })

  it('discards an answer for a generation that clear() has already moved past', async () => {
    const state = fakeState()
    state.value = { schema, error: null, generation: 0 }
    const here = scope()
    let release: (value: AdminSchema) => void = () => {}
    const api: ApiClient = <T>(): Promise<T> => new Promise<AdminSchema>((resolve) => { release = resolve }).then((value) => boundaryCast<T>(value, 'json'))

    const refresh = refreshSchemaInto(state, api, here)
    state.value = { schema: null, error: null, generation: state.value.generation + 1 }
    release(updatedSchema)
    await refresh

    expect(state.value.schema).toBeNull()
  })
})
