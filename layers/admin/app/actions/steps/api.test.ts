import { describe, expect, it, vi } from 'vitest'
import { defineAction, runAction } from '#kestrel-core/app/utils/actions'
import type { ApiFailure, EachReport, PrecheckReport, WithDeps } from '../types'
import type { Capability } from '#kestrel-admin/types/kestrel'
import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { fakeDeps } from '../__fixtures__/fake-deps'
import { apiEach, apiRequest, referencesPrecheck } from './api'

const CODE_OF: Record<number, string> = {
  400: 'VALIDATION', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED', 429: 'RATE_LIMITED', 500: 'INTERNAL', 503: 'TRANSIENT',
}

const apiError = (status: number, message: string, details?: ApiErrorDetails) => Object.assign(new Error(message), {
  status,
  name: 'ApiError',
  data: { error: message, code: CODE_OF[status] ?? 'INTERNAL', retryable: status === 429 || status === 503, ...(details ? { details } : {}) },
})

describe('api.request', () => {
  it('hands the response to onSuccess', async () => {
    const { deps, calls } = fakeDeps([{ ok: 1 }])
    const action = defineAction<WithDeps, unknown>({
      name: 'request',
      steps: [apiRequest<WithDeps, unknown, { ok: number }>('api.request', {
        call: () => ({ route: { method: 'POST', path: '/admin/publish-all/pages' } }),
        onSuccess: (ctx, value) => { ctx.result = value },
      })],
    })

    const result = await runAction(action, { deps })

    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/publish-all/pages' }, body: undefined, query: undefined }])
    expect(result).toEqual({ ok: true, result: { ok: 1 } })
  })

  it('routes an error to onError when one is given', async () => {
    const { deps } = fakeDeps([apiError(404, 'gone')])
    const seen: ApiFailure[] = []
    const action = defineAction<WithDeps, unknown>({
      name: 'request',
      steps: [apiRequest<WithDeps, unknown>('api.request', {
        call: () => ({ route: { method: 'GET', path: '/x' } }),
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
      steps: [apiRequest<WithDeps, unknown>('api.request', { call: () => ({ route: { method: 'GET', path: '/x' } }), onSuccess: () => {} })],
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
        call: (_ctx, id) => ({ route: { method: 'DELETE', path: `/pages/${id}` } }),
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
    if (!result.ok || result.result === undefined) throw new Error('expected ok with a result')

    expect(calls).toHaveLength(3)
    expect(itemErrors).toEqual(['first', 'second'])
    expect(result.result).toMatchObject({ succeeded: 1, failed: 2, lastMessage: 'second' })
    expect(result.result.firstFailure?.id).toBe('b')
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
        call: (_ctx, path) => ({ route: { method: 'DELETE', path: `/media/folders/${path}` }, query: { recursive: true } }),
        policy: 'stop',
        onDone: (ctx, report) => { ctx.result = report },
      })],
    })

    await runAction(action, { deps })

    expect(calls[0]).toMatchObject({ route: { method: 'DELETE', path: '/media/folders/docs' }, query: { recursive: true } })
  })

  it('reports progress after every item and stops sending once the signal aborts', async () => {
    const { deps, calls } = fakeDeps([null, null, null])
    const controller = new AbortController()
    const progress = vi.fn((...[done]: [number, number]) => { if (done === 2) controller.abort() })
    const action = defineAction<WithDeps, EachReport<unknown>>({
      name: 'each',
      steps: [apiEach<WithDeps, EachReport<unknown>>('api.each', {
        items: () => ['a', 'b', 'c'],
        call: (_ctx, id) => ({ route: { method: 'DELETE', path: `/media/${id}` } }),
        policy: 'continue',
        onProgress: (_ctx, done, total) => progress(done, total),
        signal: () => controller.signal,
        onDone: (ctx, report) => { ctx.result = report },
      })],
    })

    const result = await runAction(action, { deps })

    expect(calls).toHaveLength(2)
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3]])
    expect(result.ok && result.result).toMatchObject({ succeeded: 2, cancelled: true })
  })
})

describe('references.precheck', () => {
  const mediaReferrers: Capability = { method: 'GET', path: '/admin/references/to/media/:id' }

  function precheckAction(onError: 'stop' | 'skip', capability: Capability | undefined) {
    return defineAction<WithDeps & { ids: string[] }, PrecheckReport>({
      name: 'precheck',
      steps: [referencesPrecheck<WithDeps & { ids: string[] }, PrecheckReport>('references.precheck', {
        capability: () => capability,
        ids: (ctx) => ctx.input.ids,
        onError,
        onDone: (ctx, report) => { ctx.result = report },
      })],
    })
  }

  it('encodes the id in the lookup path', async () => {
    const { deps, calls } = fakeDeps([[]])

    await runAction(precheckAction('skip', mediaReferrers), { deps, ids: ['a b/c'] })

    expect(calls[0]?.route).toEqual({ method: 'GET', path: '/admin/references/to/media/a%20b%2Fc' })
  })

  it('skips a failed lookup and keeps going', async () => {
    const { deps, calls } = fakeDeps([apiError(500, 'boom'), [{ type: 'pages', field: 'body', id: 'p' }], []])

    const result = await runAction(precheckAction('skip', mediaReferrers), { deps, ids: ['a', 'b', 'c'] })
    if (!result.ok || result.result === undefined) throw new Error('expected ok with a result')

    expect(calls).toHaveLength(3)
    const report = result.result
    expect(report.checked).toBe(false)
    expect(report.verifiable).toBe(true)
    expect([...report.byId.keys()]).toEqual(['b', 'c'])
  })

  it('stops at a failed lookup and keeps the partial map', async () => {
    const { deps, calls } = fakeDeps([[], apiError(500, 'boom'), []])

    const result = await runAction(precheckAction('stop', mediaReferrers), { deps, ids: ['a', 'b', 'c'] })
    if (!result.ok || result.result === undefined) throw new Error('expected ok with a result')

    expect(calls).toHaveLength(2)
    const report = result.result
    expect([...report.byId.keys()]).toEqual(['a'])
    expect(report.forbidden).toBe(false)
  })

  it('discards everything on a 403', async () => {
    const { deps, calls } = fakeDeps([[], apiError(403, 'forbidden'), []])

    const result = await runAction(precheckAction('skip', mediaReferrers), { deps, ids: ['a', 'b', 'c'] })
    if (!result.ok || result.result === undefined) throw new Error('expected ok with a result')

    expect(calls).toHaveLength(2)
    expect(result.result).toMatchObject({ checked: false, forbidden: true })
    expect(result.result.byId.size).toBe(0)
  })

  it('skips the reference check for a collection without a referrers route', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(precheckAction('skip', undefined), { deps, ids: ['a'] })

    expect(calls).toEqual([])
    expect(result).toMatchObject({ ok: true, result: { checked: false, forbidden: false, verifiable: false } })
  })
})
