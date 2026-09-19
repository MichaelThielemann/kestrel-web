import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { describe, expect, it, vi } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import { runAction } from '#kestrel-core/app/utils/actions'
import { labelRevision, loadRevisions, readRevision, restoreRevision } from './revisions'
import type { ActionDeps, ApiRequestOptions, BusyPort } from './types'

interface Call { path: string, method: string, body?: unknown, query?: unknown }

const CODE_OF: Record<number, string> = { 400: 'VALIDATION', 404: 'NOT_FOUND', 409: 'CONFLICT', 500: 'INTERNAL' }

const apiError = (status: number, message: string, details?: ApiErrorDetails) => Object.assign(new Error(message), {
  status,
  name: 'ApiError',
  data: { error: message, code: CODE_OF[status] ?? 'INTERNAL', retryable: false, ...(details ? { details } : {}) },
})

function fakeDeps(responses: Array<unknown | Error> = []) {
  const calls: Call[] = []
  function api<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    calls.push({ path, method: options?.method ?? 'GET', body: options?.body, query: options?.query })
    const next = responses.shift()
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(boundaryCast<T>(next, 'json'))
  }
  const toast = { success: vi.fn(), error: vi.fn() }
  const t = vi.fn((key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key))
  const deps: ActionDeps = { api, t, toast }
  return { deps, calls, toast }
}

function fakeOps() {
  const errors: (string | null)[] = []
  let busy = false
  const ops: BusyPort = {
    setBusy: (on) => { busy = on },
    busy: () => busy,
    setError: (message) => { errors.push(message) },
  }
  return { ops, errors }
}

const scope = { collection: 'pages', id: 'p 1', locale: 'de' }
const LABELS = { title: 'Title', teaser: 'Teaser' }

describe('loadRevisions', () => {
  it('asks for one page of the collection history in the editor locale', async () => {
    const { deps, calls } = fakeDeps([{ items: [], total: 0, head: null }])
    const result = await runAction(loadRevisions, { deps, ...scope, limit: 50, offset: 100 })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/pages/p%201/revisions', method: 'GET', body: undefined, query: { locale: 'de', limit: 50, offset: 100 } }])
  })

  it('fails with the server message when the history cannot be read', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const result = await runAction(loadRevisions, { deps, ...scope, limit: 50, offset: 0 })

    expect(result).toEqual({ ok: false, error: 'boom' })
  })
})

describe('readRevision', () => {
  it('reads one revision including its snapshot', async () => {
    const { deps, calls } = fakeDeps([{ id: 'r1', snapshot: { title: 'T' } }])
    const result = await runAction(readRevision, { deps, ...scope, revisionId: 'r1' })

    expect(result.ok).toBe(true)
    expect(calls[0]?.path).toBe('/admin/pages/p%201/revisions/r1')
  })
})

describe('restoreRevision', () => {
  it('posts the restore, reloads the editor and reports it', async () => {
    const { deps, calls, toast } = fakeDeps([{ document: { id: 'p1' }, delivery: [] }])
    const { ops } = fakeOps()
    const refresh = vi.fn()
    const result = await runAction(restoreRevision, { deps, ...scope, revisionId: 'r1', confirmed: true, fieldLabels: LABELS, ops, refresh })

    expect(result).toEqual({ ok: true, result: null })
    expect(calls[0]).toEqual({ path: '/admin/pages/p%201/revisions/r1/restore', method: 'POST', body: undefined, query: { locale: 'de' } })
    expect(refresh).toHaveBeenCalledOnce()
    expect(toast.success).toHaveBeenCalledWith('revisions.restored')
  })

  it('names the fields the current model no longer has in the success message', async () => {
    const restore = { revisionId: 'r1', dropped: ['teaser', 'byline'], missing: [] }
    const { deps, toast } = fakeDeps([{ document: { id: 'p1' }, delivery: [], restore }])
    const { ops } = fakeOps()
    const result = await runAction(restoreRevision, { deps, ...scope, revisionId: 'r1', confirmed: true, fieldLabels: LABELS, ops, refresh: vi.fn() })

    expect(result).toEqual({ ok: true, result: restore })
    expect(toast.success).toHaveBeenCalledWith('revisions.restoredWithoutFields:{"fields":"Teaser, Byline"}')
  })

  it('does nothing without a confirmation', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops } = fakeOps()
    const result = await runAction(restoreRevision, { deps, ...scope, revisionId: 'r1', confirmed: false, fieldLabels: LABELS, ops, refresh: vi.fn() })

    expect(result.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('explains a 409 as a version without stored content and leaves the editor untouched', async () => {
    const { deps } = fakeDeps([apiError(409, 'no snapshot')])
    const { ops, errors } = fakeOps()
    const refresh = vi.fn()
    const result = await runAction(restoreRevision, { deps, ...scope, revisionId: 'r1', confirmed: true, fieldLabels: LABELS, ops, refresh })

    expect(result.ok).toBe(false)
    expect(errors).toEqual([null, 'revisions.skippedCannotRestore'])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows what the validator rejected instead of a bare 400', async () => {
    const details = { problems: [{ path: '/body/0', message: 'unknown block type "teaserGrid"' }], fields: [{ field: 'title', message: 'required' }] }
    const { deps } = fakeDeps([apiError(400, 'pages.body: invalid', details)])
    const { ops, errors } = fakeOps()
    const result = await runAction(restoreRevision, { deps, ...scope, revisionId: 'r1', confirmed: true, fieldLabels: LABELS, ops, refresh: vi.fn() })

    expect(result.ok).toBe(false)
    expect(errors[1]).toBe('pages.body: invalid — Title: required — /body/0: unknown block type "teaserGrid"')
  })
})

describe('labelRevision', () => {
  it('patches the label and returns the updated summary', async () => {
    const { deps, calls, toast } = fakeDeps([{ id: 'r1', label: 'Before the relaunch' }])
    const { ops } = fakeOps()
    const result = await runAction(labelRevision, { deps, ...scope, revisionId: 'r1', label: 'Before the relaunch', ops })

    expect(result).toEqual({ ok: true, result: { id: 'r1', label: 'Before the relaunch' } })
    expect(calls[0]).toEqual({ path: '/admin/pages/p%201/revisions/r1', method: 'PATCH', body: { label: 'Before the relaunch' }, query: { locale: 'de' } })
    expect(toast.success).toHaveBeenCalledWith('revisions.labelSaved')
  })

  it('clears the label with null and says so', async () => {
    const { deps, calls, toast } = fakeDeps([{ id: 'r1', label: null }])
    const { ops } = fakeOps()
    await runAction(labelRevision, { deps, ...scope, revisionId: 'r1', label: null, ops })

    expect(calls[0]?.body).toEqual({ label: null })
    expect(toast.success).toHaveBeenCalledWith('revisions.labelCleared')
  })

  it('surfaces a failure on the dialog instead of the toast', async () => {
    const { deps, toast } = fakeDeps([apiError(404, 'gone')])
    const { ops, errors } = fakeOps()
    const result = await runAction(labelRevision, { deps, ...scope, revisionId: 'r1', label: 'x', ops })

    expect(result.ok).toBe(false)
    expect(errors).toEqual([null, 'gone'])
    expect(toast.success).not.toHaveBeenCalled()
  })
})
