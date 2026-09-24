import { describe, expect, it, vi } from 'vitest'
import { runAction } from '#kestrel-core/app/utils/actions'
import type { Workflow } from '#kestrel-admin/types/kestrel'
import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { fakeDeps } from './__fixtures__/fake-deps'
import { bulkDelete, bulkSetStatus, previewBulkDelete } from './list'

const CODE_OF: Record<number, string> = {
  400: 'VALIDATION', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED', 429: 'RATE_LIMITED', 500: 'INTERNAL', 503: 'TRANSIENT',
}

const apiError = (status: number, message: string, details?: ApiErrorDetails) => Object.assign(new Error(message), {
  status,
  name: 'ApiError',
  data: { error: message, code: CODE_OF[status] ?? 'INTERNAL', retryable: status === 429 || status === 503, ...(details ? { details } : {}) },
})

function fakeOps() {
  let busy = false
  const errorLog: (string | null)[] = []
  return {
    setBusy: vi.fn((on: boolean) => { busy = on }),
    busy: () => busy,
    setError: vi.fn((message: string | null) => { errorLog.push(message) }),
    errorLog,
  }
}

const DEFAULT_WORKFLOW: Workflow = { field: 'status', live: 'published', draft: 'draft', done: 'finished' }
const pagesReferrers = { method: 'GET' as const, path: '/admin/references/to/pages/:id' }

describe('bulkSetStatus', () => {
  it('publishes every id and toasts once', async () => {
    const { deps, calls, toast } = fakeDeps([null, null, null])
    const ops = fakeOps()
    const refresh = vi.fn()

    const result = await runAction(bulkSetStatus, { deps, collection: 'pages', ids: ['a', 'b', 'c'], workflow: DEFAULT_WORKFLOW, live: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      { route: { method: 'PATCH', path: '/pages/a' }, body: { status: 'published' }, query: undefined },
      { route: { method: 'PATCH', path: '/pages/b' }, body: { status: 'published' }, query: undefined },
      { route: { method: 'PATCH', path: '/pages/c' }, body: { status: 'published' }, query: undefined },
    ])
    expect(toast.success).toHaveBeenCalledWith('toast.published')
    expect(ops.errorLog).toEqual([null])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('includes the locale when given', async () => {
    const { deps, calls } = fakeDeps([null])
    const ops = fakeOps()

    await runAction(bulkSetStatus, { deps, collection: 'pages', ids: ['a'], workflow: DEFAULT_WORKFLOW, live: false, locale: 'de', ops, refresh: vi.fn() })

    expect(calls[0]).toMatchObject({ body: { status: 'draft', locale: 'de' } })
  })

  it('continues past a failed item, toasts it, and skips the success toast', async () => {
    const { deps, calls, toast } = fakeDeps([null, apiError(400, 'slug must be unique'), null])
    const ops = fakeOps()
    const refresh = vi.fn()

    const result = await runAction(bulkSetStatus, { deps, collection: 'pages', ids: ['a', 'b', 'c'], workflow: DEFAULT_WORKFLOW, live: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(3)
    expect(toast.error).toHaveBeenCalledWith('slug must be unique')
    expect(toast.success).not.toHaveBeenCalled()
    expect(ops.setError).toHaveBeenCalledWith('slug must be unique')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('remembers the last message when every item fails', async () => {
    const { deps, toast } = fakeDeps([apiError(400, 'first'), apiError(400, 'second'), apiError(400, 'third')])
    const ops = fakeOps()
    const refresh = vi.fn()

    const result = await runAction(bulkSetStatus, { deps, collection: 'pages', ids: ['a', 'b', 'c'], workflow: DEFAULT_WORKFLOW, live: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(toast.error).toHaveBeenCalledTimes(3)
    expect(ops.setError).toHaveBeenCalledWith('third')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('writes the field and values of a custom workflow', async () => {
    const workflow: Workflow = { field: 'status', live: 'live', draft: 'entwurf' }
    const { deps, calls, toast } = fakeDeps([null, null])
    const ops = fakeOps()

    await runAction(bulkSetStatus, { deps, collection: 'pages', ids: ['a'], workflow, live: true, ops, refresh: vi.fn() })
    await runAction(bulkSetStatus, { deps, collection: 'pages', ids: ['b'], workflow, live: false, ops, refresh: vi.fn() })

    expect(calls.map((c) => c.body)).toEqual([{ status: 'live' }, { status: 'entwurf' }])
    expect(toast.success).toHaveBeenNthCalledWith(1, 'toast.published')
    expect(toast.success).toHaveBeenNthCalledWith(2, 'toast.unpublished')
  })

  it('writes a workflow that names another field entirely', async () => {
    const workflow: Workflow = { field: 'state', live: 'live', draft: 'entwurf' }
    const { deps, calls } = fakeDeps([null])
    const ops = fakeOps()

    await runAction(bulkSetStatus, { deps, collection: 'pages', ids: ['a'], workflow, live: true, locale: 'de', ops, refresh: vi.fn() })

    expect(calls[0]).toMatchObject({ body: { state: 'live', locale: 'de' } })
  })

  it('fails on an empty selection without a request or a refresh', async () => {
    const { deps, calls } = fakeDeps([])
    const ops = fakeOps()
    const refresh = vi.fn()

    const result = await runAction(bulkSetStatus, { deps, collection: 'pages', ids: [], workflow: DEFAULT_WORKFLOW, live: true, ops, refresh })

    expect(result).toEqual({ ok: false, error: 'guard.selection' })
    expect(calls).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('previewBulkDelete', () => {
  it('checks the references of every id', async () => {
    const { deps, calls } = fakeDeps([[{ type: 'pages', field: 'body', id: 'x' }]])

    const result = await runAction(previewBulkDelete, { deps, collection: 'pages', ids: ['p1'], capability: pagesReferrers })

    expect(calls).toEqual([{ route: { method: 'GET', path: '/admin/references/to/pages/p1' }, body: undefined, query: undefined }])
    expect(result).toMatchObject({ ok: true, result: { checked: true, count: 1, referencedCount: 1 } })
  })

  it('fails on an empty selection before any request', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(previewBulkDelete, { deps, collection: 'pages', ids: [], capability: pagesReferrers })

    expect(result).toEqual({ ok: false, error: 'guard.selection' })
    expect(calls).toEqual([])
  })

  it('degrades to an unchecked report on a 403', async () => {
    const { deps } = fakeDeps([apiError(403, 'forbidden')])

    const result = await runAction(previewBulkDelete, { deps, collection: 'pages', ids: ['p1'], capability: pagesReferrers })

    expect(result).toMatchObject({ ok: true, result: { checked: false, references: [], referencedCount: 0 } })
  })

  it('skips the reference check for a collection without a referrers route', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(previewBulkDelete, { deps, collection: 'news', ids: ['p1'], capability: undefined })

    expect(calls).toEqual([])
    expect(result).toMatchObject({ ok: true, result: { checked: false, referencedCount: 0 } })
  })
})

describe('bulkDelete', () => {
  it('does nothing when not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const ops = fakeOps()
    const refresh = vi.fn()

    const result = await runAction(bulkDelete, { deps, collection: 'pages', ids: ['a'], confirmed: false, ops, refresh })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('deletes every id, refreshes before the toast, and reports success', async () => {
    const order: string[] = []
    const { deps, calls, toast } = fakeDeps([null, null, null])
    toast.success.mockImplementation(() => order.push('toast'))
    const ops = fakeOps()
    const refresh = vi.fn(() => { order.push('refresh') })

    const result = await runAction(bulkDelete, { deps, collection: 'pages', ids: ['a', 'b', 'c'], confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toMatchObject({ route: { method: 'DELETE', path: '/pages/a' } })
    expect(toast.success).toHaveBeenCalledWith('toast.deleted')
    expect(order).toEqual(['refresh', 'toast'])
  })

  it('fails and skips the refresh when the only id is referenced', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'pages/x is referenced by pages/y (body)')])
    const ops = fakeOps()
    const refresh = vi.fn()

    const result = await runAction(bulkDelete, { deps, collection: 'pages', ids: ['x'], confirmed: true, ops, refresh })

    expect(result).toEqual({ ok: false, error: 'pages/x is referenced by pages/y (body)' })
    expect(toast.error).toHaveBeenCalledWith('refs.conflictAfterPrecheck pages/y (body)')
    expect(ops.setError).toHaveBeenCalledWith('pages/x is referenced by pages/y (body)')
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('prefers details.referrers over the message when the CONFLICT body carries them', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'pages/x is still referenced', {
      referrers: [{ type: 'pages', id: 'z', field: 'body' }],
    })])
    const ops = fakeOps()

    await runAction(bulkDelete, { deps, collection: 'pages', ids: ['x'], confirmed: true, ops, refresh: vi.fn() })

    expect(toast.error).toHaveBeenCalledWith('refs.conflictAfterPrecheck pages/z (body)')
  })

  it('continues past a failed id when others succeed', async () => {
    const { deps, calls, toast } = fakeDeps([null, apiError(409, 'blocked'), null])
    const ops = fakeOps()
    const refresh = vi.fn()

    const result = await runAction(bulkDelete, { deps, collection: 'pages', ids: ['a', 'b', 'c'], confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(3)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('toast.deleted')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
