import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction } from '#kestrel-core/app/utils/actions'
import type { ActionDeps, ApiClient, ApiFailure, ApiRequestOptions, EachReport, PrecheckReport, WithDeps } from '../types'
import { apiEach, apiRequest, isSaveResponse, referencesPrecheck } from './api'

interface Call { path: string, method: string, body?: unknown, query?: unknown }

function fakeApi(responses: Array<unknown | Error>) {
  const calls: Call[] = []
  const api = (async (path: string, options?: ApiRequestOptions) => {
    calls.push({ path, method: options?.method ?? 'GET', body: options?.body, query: options?.query })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }) as ApiClient
  return { api, calls }
}

const CODE_OF: Record<number, string> = {
  400: 'VALIDATION', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED', 429: 'RATE_LIMITED', 500: 'INTERNAL', 503: 'TRANSIENT',
}

const apiError = (status: number, message: string, details?: ApiErrorDetails) => Object.assign(new Error(message), {
  status,
  name: 'ApiError',
  data: { error: message, code: CODE_OF[status] ?? 'INTERNAL', retryable: status === 429 || status === 503, ...(details ? { details } : {}) },
})

function fakeDeps(responses: Array<unknown | Error> = []) {
  const { api, calls } = fakeApi(responses)
  const toast = { success: vi.fn(), error: vi.fn() }
  const t = vi.fn((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key))
  const deps: ActionDeps = { api, t, toast }
  return { deps, calls, toast, t }
}

describe('isSaveResponse', () => {
  it('accepts only the strict document/delivery pair', () => {
    expect(isSaveResponse({ document: { id: 'a' }, delivery: [] })).toBe(true)
    expect(isSaveResponse({ document: { id: 'a' } })).toBe(false)
    expect(isSaveResponse({ delivery: [] })).toBe(false)
    expect(isSaveResponse({ document: null, delivery: [] })).toBe(false)
    expect(isSaveResponse({ document: { id: 'a' }, delivery: 'no' })).toBe(false)
    expect(isSaveResponse([{ document: {}, delivery: [] }])).toBe(false)
    expect(isSaveResponse(null)).toBe(false)
  })
})

describe('api.request', () => {
  it('hands the response to onSuccess', async () => {
    const { deps, calls } = fakeDeps([{ ok: 1 }])
    const action = defineAction<WithDeps, unknown>({
      name: 'request',
      steps: [apiRequest<WithDeps, unknown, { ok: number }>('api.request', {
        call: () => ({ path: '/admin/publish-all/pages', method: 'POST' }),
        onSuccess: (ctx, value) => { ctx.result = value },
      })],
    })

    const result = await runAction(action, { deps })

    expect(calls).toEqual([{ path: '/admin/publish-all/pages', method: 'POST', body: undefined, query: undefined }])
    expect(result).toEqual({ ok: true, result: { ok: 1 } })
  })

  it('routes an error to onError when one is given', async () => {
    const { deps } = fakeDeps([apiError(404, 'gone')])
    const seen: ApiFailure[] = []
    const action = defineAction<WithDeps, unknown>({
      name: 'request',
      steps: [apiRequest<WithDeps, unknown>('api.request', {
        call: () => ({ path: '/x' }),
        onSuccess: () => {},
        onError: (_ctx, err) => { seen.push(err) },
      })],
    })

    const result = await runAction(action, { deps })

    expect(result.ok).toBe(true)
    expect(seen).toEqual([{ status: 404, code: 'NOT_FOUND', retryable: false, message: 'gone', runId: undefined, details: undefined }])
  })

  it('rethrows when no onError is given', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const action = defineAction<WithDeps, unknown>({
      name: 'request',
      steps: [apiRequest<WithDeps, unknown>('api.request', { call: () => ({ path: '/x' }), onSuccess: () => {} })],
    })

    const result = await runAction(action, { deps })

    expect(result).toMatchObject({ ok: false, error: 'boom' })
    error.mockRestore()
  })
})

describe('api.each', () => {
  function eachAction(policy: 'continue' | 'stop', itemErrors: string[]) {
    return defineAction<WithDeps & { ids: string[] }, EachReport<unknown>>({
      name: 'each',
      steps: [apiEach<WithDeps & { ids: string[] }, EachReport<unknown>>('api.each', {
        items: (ctx) => ctx.input.ids,
        call: (_ctx, id) => ({ path: `/pages/${id}`, method: 'DELETE' }),
        policy,
        onItemError: (_ctx, item) => { itemErrors.push(item.message ?? '') },
        onDone: (ctx, report) => { ctx.result = report },
      })],
    })
  }

  it('runs every item and reports the last failure when continuing', async () => {
    const { deps, calls } = fakeDeps([null, apiError(409, 'first'), apiError(400, 'second')])
    const itemErrors: string[] = []

    const result = await runAction(eachAction('continue', itemErrors), { deps, ids: ['a', 'b', 'c'] })

    expect(calls).toHaveLength(3)
    expect(itemErrors).toEqual(['first', 'second'])
    expect(result).toMatchObject({ ok: true, result: { succeeded: 1, failed: 2, lastMessage: 'second' } })
    expect((result as { result: EachReport<unknown> }).result.firstFailure?.id).toBe('b')
  })

  it('breaks at the first failure when stopping', async () => {
    const { deps, calls } = fakeDeps([apiError(409, 'nope'), null])
    const itemErrors: string[] = []

    const result = await runAction(eachAction('stop', itemErrors), { deps, ids: ['a', 'b'] })

    expect(calls).toHaveLength(1)
    expect(result).toMatchObject({ ok: true, result: { succeeded: 0, failed: 1 } })
  })

  it('reports an empty run', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(eachAction('continue', []), { deps, ids: [] })

    expect(calls).toEqual([])
    expect(result).toMatchObject({ ok: true, result: { succeeded: 0, failed: 0, lastMessage: null, firstFailure: null } })
  })

  it('passes the call query through', async () => {
    const { deps, calls } = fakeDeps([null])
    const action = defineAction<WithDeps, EachReport<unknown>>({
      name: 'each',
      steps: [apiEach<WithDeps, EachReport<unknown>>('api.each', {
        items: () => ['docs'],
        call: (_ctx, path) => ({ path: `/media/folders/${path}`, method: 'DELETE', query: { recursive: true } }),
        policy: 'stop',
        onDone: (ctx, report) => { ctx.result = report },
      })],
    })

    await runAction(action, { deps })

    expect(calls[0]).toMatchObject({ path: '/media/folders/docs', query: { recursive: true } })
  })
})

describe('references.precheck', () => {
  function precheckAction(onError: 'stop' | 'skip', allowed = true) {
    return defineAction<WithDeps & { ids: string[] }, PrecheckReport>({
      name: 'precheck',
      steps: [referencesPrecheck<WithDeps & { ids: string[] }, PrecheckReport>('references.precheck', {
        allowed: () => allowed,
        target: () => 'media',
        ids: (ctx) => ctx.input.ids,
        onError,
        onDone: (ctx, report) => { ctx.result = report },
      })],
    })
  }

  it('encodes the id in the lookup path', async () => {
    const { deps, calls } = fakeDeps([[]])

    await runAction(precheckAction('skip'), { deps, ids: ['a b/c'] })

    expect(calls[0]?.path).toBe('/admin/references/to/media/a%20b%2Fc')
  })

  it('skips a failed lookup and keeps going', async () => {
    const { deps, calls } = fakeDeps([apiError(500, 'boom'), [{ type: 'pages', field: 'body', id: 'p' }], []])

    const result = await runAction(precheckAction('skip'), { deps, ids: ['a', 'b', 'c'] })

    expect(calls).toHaveLength(3)
    const report = (result as { result: PrecheckReport }).result
    expect(report.checked).toBe(false)
    expect([...report.byId.keys()]).toEqual(['b', 'c'])
  })

  it('stops at a failed lookup and keeps the partial map', async () => {
    const { deps, calls } = fakeDeps([[], apiError(500, 'boom'), []])

    const result = await runAction(precheckAction('stop'), { deps, ids: ['a', 'b', 'c'] })

    expect(calls).toHaveLength(2)
    const report = (result as { result: PrecheckReport }).result
    expect([...report.byId.keys()]).toEqual(['a'])
    expect(report.forbidden).toBe(false)
  })

  it('discards everything on a 403', async () => {
    const { deps, calls } = fakeDeps([[], apiError(403, 'forbidden'), []])

    const result = await runAction(precheckAction('skip'), { deps, ids: ['a', 'b', 'c'] })

    expect(calls).toHaveLength(2)
    expect(result).toMatchObject({ ok: true, result: { checked: false, forbidden: true } })
    expect((result as { result: PrecheckReport }).result.byId.size).toBe(0)
  })

  it('never asks when the check is not allowed', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(precheckAction('skip', false), { deps, ids: ['a'] })

    expect(calls).toEqual([])
    expect(result).toMatchObject({ ok: true, result: { checked: false, forbidden: false } })
  })
})
