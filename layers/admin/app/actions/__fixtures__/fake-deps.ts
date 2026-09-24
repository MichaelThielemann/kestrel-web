import { vi } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { capabilityResolver } from '../../utils/capabilities'
import type { ApiRoute, CapabilityResolver } from '../../utils/capabilities'
import type { ActionDeps, ApiRequestOptions } from '../types'
import fullAccessSchemaFixture from '#kestrel-core/server/__fixtures__/admin-schema.json'

/** The playground schema with every capability present and none denied, used to seed `ActionDeps.capabilities` in action tests. */
export const fullAccessSchema: AdminSchema = boundaryCast<AdminSchema>(fullAccessSchemaFixture, 'json')

export const fullAccessCapabilities: CapabilityResolver = capabilityResolver(fullAccessSchema)

export interface Call { route: ApiRoute, body?: unknown, query?: unknown }

export function fakeApi(responses: Array<unknown | Error>) {
  const calls: Call[] = []
  function api<T>(route: ApiRoute, options?: ApiRequestOptions): Promise<T> {
    calls.push({ route, body: options?.body, query: options?.query })
    const next = responses.shift()
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(boundaryCast<T>(next, 'json'))
  }
  return { api, calls }
}

export function fakeDeps(responses: Array<unknown | Error> = [], capabilities: CapabilityResolver = fullAccessCapabilities) {
  const { api, calls } = fakeApi(responses)
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  const t = vi.fn((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key))
  const deps: ActionDeps = { api, t, toast, capabilities }
  return { deps, calls, toast, t }
}
