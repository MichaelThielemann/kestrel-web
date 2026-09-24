import { describe, expect, it, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { LAYER_ROUTES } from '#kestrel-core/fixed-routes'
import type { ApiClient } from '../actions/types'
import type { ApiRoute } from '../utils/capabilities'
import { loadSchemaInto, type SchemaState } from './useSchema'

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: ['delivery'],
  capabilities: {},
}

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
