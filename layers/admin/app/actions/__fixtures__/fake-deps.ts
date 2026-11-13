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

/** The text `failureText` builds under the fake `t` of `fakeDeps` for a failure with this status and error id. */
export function referencedFailure(message: string, status: number, id?: string): string {
  const reference = [status > 0 ? `HTTP ${status}` : '', id ? `error.id:${JSON.stringify({ id })}` : ''].filter(Boolean).join(' · ')
  return `error.withReference:${JSON.stringify({ message, reference })}`
}

/** The text `answeredMessage` builds under the fake `t` of `fakeDeps`: `lead` followed by the message of the answer. */
export function ledFailure(lead: string, detail: string): string {
  return `error.detail:${JSON.stringify({ lead, detail })}`
}

/** A `$fetch` error of a request sent with `requestId` that got no answer at all. */
export function unansweredFetchError(requestId: string): Error {
  return Object.assign(new Error('[POST] "/admin/api/x": <no response> Failed to fetch'), {
    name: 'FetchError',
    options: { headers: new Headers({ 'x-request-id': requestId }) },
  })
}

/** The text `failureText` builds under the fake `t` of `fakeDeps` for a request without an answer, after `message` when there is one. */
export function noAnswerFailure(message: string, id: string): string {
  const hint = `error.unreached:${JSON.stringify({ reference: `error.noAnswer · error.id:${JSON.stringify({ id })}` })}`
  return message ? `error.withHint:${JSON.stringify({ message, hint })}` : hint
}
