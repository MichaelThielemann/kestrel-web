import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { describe, expect, it, vi } from 'vitest'
import { runAction } from '#kestrel-core/app/utils/actions'
import { humanizeSize } from '../utils/library'
import {
  exportMedia,
  imagesRegisterAndSync,
  linksRebuild,
  migrationsApply,
  mediaReconcile,
  mediaReconcileDelete,
  migrationsDryRun,
  previewPrune,
  prune,
  publishAll,
  referencesRebuild,
  replicationRestore,
  replicationSnapshot,
  userCreate,
  userSetPassword,
  userToggle,
} from './system'
import type { ActionDeps, ApiClient, ApiRequestOptions, BusyPort } from './types'

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

function fakeOps() {
  const busyLog: boolean[] = []
  const errors: (string | null)[] = []
  let busy = false
  const ops: BusyPort = {
    setBusy: (on) => { busy = on; busyLog.push(on) },
    busy: () => busy,
    setError: (message) => { errors.push(message) },
  }
  return { ops, busyLog, errors }
}

function fakeRefresh() {
  const calls: number[] = []
  const refresh = vi.fn(() => { calls.push(Date.now()) })
  return { refresh, calls }
}

describe('publishAll', () => {
  it('publishes and toasts the report, keeping the redirects field', async () => {
    const { deps, calls, toast } = fakeDeps([{ documents: 3, live: 3, errors: 0, redirects: { rules: 2, skipped: 1 } }])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(publishAll, { deps, ops })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/publish-all/pages', method: 'POST', body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('delivery.done:{"documents":3,"live":3,"errors":0}')
    expect(busyLog).toEqual([true, false])
    expect(result.ok && result.result?.redirects).toEqual({ rules: 2, skipped: 1 })
  })

  it('toasts the raw error message and fails the action', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(publishAll, { deps, ops })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(busyLog).toEqual([true, false])
  })

  it('falls back to delivery.failed when the error message is empty', async () => {
    const { deps, toast } = fakeDeps([apiError(500, '')])
    const { ops } = fakeOps()

    const result = await runAction(publishAll, { deps, ops })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('delivery.failed')
  })
})

describe('exportMedia', () => {
  it('exports and toasts the media and variant counts', async () => {
    const { deps, calls, toast } = fakeDeps([{ written: 4, skipped: 1, missing: 0, conflicts: 2, variants: { written: 6, skipped: 3 } }])
    const { ops } = fakeOps()

    const result = await runAction(exportMedia, { deps, ops })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/media/export', method: 'POST', body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('delivery.exportDone:{"written":4,"skipped":1,"missing":0,"conflicts":2,"variantsWritten":6,"variantsSkipped":3}')
  })

  it('toasts the raw error message and fails the action', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(exportMedia, { deps, ops })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(busyLog).toEqual([true, false])
  })

  it('falls back to delivery.exportFailed on an empty error message', async () => {
    const { deps, toast } = fakeDeps([apiError(500, '')])
    const { ops } = fakeOps()

    const result = await runAction(exportMedia, { deps, ops })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('delivery.exportFailed')
  })
})

describe('replicationSnapshot', () => {
  it('snapshots, toasts the humanised size and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ generation: 5, bytes: 123456 }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()
    const onNotFound = vi.fn()

    const result = await runAction(replicationSnapshot, { deps, ops, onNotFound, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/replication/snapshot', method: 'POST', body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith(`replication.snapshotDone:{"bytes":"${humanizeSize(123456)}"}`)
    expect(refreshCalls.length).toBe(1)
  })

  it('calls onNotFound with no toast and no reload on a 404', async () => {
    const { deps, toast } = fakeDeps([apiError(404, 'no replication')])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()
    const onNotFound = vi.fn()

    const result = await runAction(replicationSnapshot, { deps, ops, onNotFound, refresh })

    expect(result.ok).toBe(false)
    expect(onNotFound).toHaveBeenCalledOnce()
    expect(toast.error).not.toHaveBeenCalled()
    expect(refreshCalls.length).toBe(0)
  })

  it('toasts and skips the reload on any other error', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()
    const onNotFound = vi.fn()

    await runAction(replicationSnapshot, { deps, ops, onNotFound, refresh })

    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(onNotFound).not.toHaveBeenCalled()
    expect(refreshCalls.length).toBe(0)
  })
})

describe('replicationRestore', () => {
  it('fails the dialog guard and makes no request when point is null', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(replicationRestore, { deps, point: null, ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(refreshCalls.length).toBe(0)
  })

  it('restores by generation', async () => {
    const { deps, calls } = fakeDeps([{ generation: 7, at: 1000, file: 'db.snap', restartRequired: true }])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(replicationRestore, { deps, point: { generation: 'g7' }, ops, refresh })

    expect(calls).toEqual([{ path: '/admin/replication/restore', method: 'POST', body: { generation: 'g7' }, query: undefined }])
  })

  it('restores by time and carries restartRequired, then reloads', async () => {
    const { deps, calls } = fakeDeps([{ generation: 7, at: 1000, file: 'db.snap', restartRequired: true }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(replicationRestore, { deps, point: { at: 1000 }, ops, refresh })

    expect(calls).toEqual([{ path: '/admin/replication/restore', method: 'POST', body: { at: 1000 }, query: undefined }])
    expect(result.ok && result.result?.restartRequired).toBe(true)
    expect(refreshCalls.length).toBe(1)
  })

  it('toasts replication.restoreNotFound on a 404 and skips the reload', async () => {
    const { deps, toast } = fakeDeps([apiError(404, 'nope')])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    await runAction(replicationRestore, { deps, point: { generation: 'g1' }, ops, refresh })

    expect(toast.error).toHaveBeenCalledWith('replication.restoreNotFound')
    expect(refreshCalls.length).toBe(0)
  })

  it('toasts the raw message on any other error', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(replicationRestore, { deps, point: { generation: 'g1' }, ops, refresh })

    expect(toast.error).toHaveBeenCalledWith('boom')
  })
})

describe('migrationsDryRun', () => {
  it('posts dry: true and carries the result, without a reload', async () => {
    const { deps, calls } = fakeDeps([{ dry: true, changes: [{ id: '2026-09-02-example', documents: 3 }] }])
    const { ops } = fakeOps()

    const result = await runAction(migrationsDryRun, { deps, ops })

    expect(calls).toEqual([{ path: '/admin/migrations/apply', method: 'POST', body: { dry: true }, query: undefined }])
    expect(result.ok && result.result?.changes).toEqual([{ id: '2026-09-02-example', documents: 3 }])
  })

  it('toasts and fails on error', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops } = fakeOps()

    const result = await runAction(migrationsDryRun, { deps, ops })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
  })
})

describe('migrationsApply', () => {
  it('fails the dialog guard and makes no request when not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(migrationsApply, { deps, confirmed: false, ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(refreshCalls.length).toBe(0)
  })

  it('applies, toasts the count, and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ applied: [{ id: '2026-09-02-example', appliedAt: 1000, documents: 3, durationMs: 12 }] }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(migrationsApply, { deps, confirmed: true, ops, refresh })

    expect(calls).toEqual([{ path: '/admin/migrations/apply', method: 'POST', body: { dry: false }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('migrations.applyDone:{"count":1}')
    expect(result.ok && result.result?.applied.length).toBe(1)
    expect(refreshCalls.length).toBe(1)
  })

  it('toasts and skips the reload on error', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    await runAction(migrationsApply, { deps, confirmed: true, ops, refresh })

    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(refreshCalls.length).toBe(0)
  })
})

describe('userCreate', () => {
  it('fails validation on a blank username without a request', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userCreate, { deps, username: '  ', password: 'longenough', roles: [], ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(errors).toEqual(['users.usernameRequired'])
    expect(refreshCalls.length).toBe(0)
  })

  it('fails validation on a short password without a request', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(userCreate, { deps, username: 'bob', password: 'short12', roles: [], ops, refresh })

    expect(calls.length).toBe(0)
    expect(errors).toEqual(['users.passwordTooShort'])
  })

  it('creates the user with the trimmed username, toasts and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ id: 'u1' }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userCreate, { deps, username: '  bob  ', password: 'longenough', roles: ['editor'], ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/users', method: 'POST', body: { username: 'bob', password: 'longenough', roles: ['editor'] }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('users.created')
    expect(refreshCalls.length).toBe(1)
  })

  it('sets the inline error without a toast on failure and skips the reload', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'username taken')])
    const { ops, errors } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userCreate, { deps, username: 'bob', password: 'longenough', roles: [], ops, refresh })

    expect(result.ok).toBe(false)
    expect(errors).toContain('username taken')
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(refreshCalls.length).toBe(0)
  })
})

describe('userSetPassword', () => {
  it('makes no request when the user is null', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()

    const result = await runAction(userSetPassword, { deps, userId: null, password: 'longenough', ops })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(errors).toEqual([])
  })

  it('fails validation on a short password without a request', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()

    await runAction(userSetPassword, { deps, userId: 'u1', password: 'short12', ops })

    expect(calls.length).toBe(0)
    expect(errors).toEqual(['users.passwordTooShort'])
  })

  it('sets the password and toasts success', async () => {
    const { deps, calls, toast } = fakeDeps([{}])
    const { ops } = fakeOps()

    const result = await runAction(userSetPassword, { deps, userId: 'u1', password: 'longenough', ops })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/users/u1/password', method: 'PUT', body: { password: 'longenough' }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('users.passwordChanged')
  })

  it('sets the inline error without a toast on failure', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops, errors } = fakeOps()

    const result = await runAction(userSetPassword, { deps, userId: 'u1', password: 'longenough', ops })

    expect(result.ok).toBe(false)
    expect(errors).toContain('boom')
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('referencesRebuild', () => {
  it('rebuilds, toasts the report and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ documents: 5, entries: 12 }])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(referencesRebuild, { deps, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/references/rebuild', method: 'POST', body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('refs.rebuildDone:{"documents":5,"entries":12}')
    expect(busyLog).toEqual([true, false])
    expect(refreshCalls.length).toBe(1)
  })

  it('toasts the raw error message and skips the reload', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(referencesRebuild, { deps, ops, refresh })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(refreshCalls.length).toBe(0)
    expect(busyLog).toEqual([true, false])
  })
})

describe('linksRebuild', () => {
  it('rebuilds, toasts the report and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ documents: 2, entries: 9 }])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(linksRebuild, { deps, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/links/rebuild', method: 'POST', body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('references.links.rebuildDone:{"documents":2,"entries":9}')
    expect(busyLog).toEqual([true, false])
    expect(refreshCalls.length).toBe(1)
  })

  it('toasts the raw error message and skips the reload', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(linksRebuild, { deps, ops, refresh })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(refreshCalls.length).toBe(0)
    expect(busyLog).toEqual([true, false])
  })
})

describe('userToggle', () => {
  it('deactivates an active user, reloads, then clears busy', async () => {
    const { deps, calls } = fakeDeps([undefined])
    const { ops, busyLog } = fakeOps()
    const order: string[] = []
    const refresh = vi.fn(() => { order.push('refresh') })
    const trackedOps: BusyPort = {
      setBusy: (on) => { ops.setBusy(on); if (!on) order.push('busy:off') },
      busy: ops.busy,
      setError: ops.setError,
    }

    const result = await runAction(userToggle, { deps, userId: 'u1', active: true, ops: trackedOps, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/users/u1', method: 'DELETE', body: undefined, query: undefined }])
    expect(busyLog).toEqual([true, false])
    expect(order).toEqual(['refresh', 'busy:off'])
  })

  it('activates an inactive user', async () => {
    const { deps, calls } = fakeDeps([undefined])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(userToggle, { deps, userId: 'u1', active: false, ops, refresh })

    expect(calls).toEqual([{ path: '/users/u1/activate', method: 'POST', body: undefined, query: undefined }])
  })

  it('toasts the error, skips the reload, and still clears busy', async () => {
    const { deps, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userToggle, { deps, userId: 'u1', active: true, ops, refresh })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(refreshCalls.length).toBe(0)
    expect(busyLog).toEqual([true, false])
  })
})

describe('previewPrune', () => {
  it('fills the result from orphaned and calls exactly GET /admin/images/status', async () => {
    const { deps, calls } = fakeDeps([{ sizes: [], job: null, orphaned: { sizes: ['old-size'], variants: 5 } }])

    const result = await runAction(previewPrune, { deps })

    expect(result.ok).toBe(true)
    expect(result.ok && result.result).toEqual({ sizes: ['old-size'], variants: 5 })
    expect(calls).toEqual([{ path: '/admin/images/status', method: 'GET', body: undefined, query: undefined }])
  })

  it('fails at guard.selection on an empty orphan set, so no dialog opens', async () => {
    const { deps } = fakeDeps([{ sizes: [], job: null, orphaned: { sizes: [], variants: 0 } }])

    const result = await runAction(previewPrune, { deps })

    expect(result).toEqual({ ok: false, error: 'guard.selection' })
  })
})

describe('prune', () => {
  it('fails the dialog guard and makes no request when not confirmed', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(prune, { deps, sizes: ['old-size'], confirmed: false, ops: fakeOps().ops, refresh: fakeRefresh().refresh })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls.length).toBe(0)
  })

  it('prunes the given sizes, toasts, reloads, and clears busy', async () => {
    const { deps, calls, toast } = fakeDeps([{ sizes: 2, variants: 10 }])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(prune, { deps, sizes: ['old-size', 'stale'], confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/images/prune', method: 'POST', body: { sizes: ['old-size', 'stale'] }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('images.pruneDone')
    expect(refreshCalls.length).toBe(1)
    expect(busyLog).toEqual([true, false])
  })

  it('sets the inline error and toasts verbatim on a 400, and clears busy', async () => {
    const message = 'images: size "thumb" is not a registered size'
    const { deps, toast } = fakeDeps([apiError(400, message)])
    const { ops, errors, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(prune, { deps, sizes: ['thumb'], confirmed: true, ops, refresh })

    expect(result.ok).toBe(false)
    expect(errors).toContain(message)
    expect(toast.error).toHaveBeenCalledWith(message)
    expect(refreshCalls.length).toBe(0)
    expect(busyLog).toEqual([true, false])
  })
})

describe('mediaReconcile', () => {
  const report = { blobsWithoutRow: ['media/stray.png'], rowsWithoutBlob: ['media/lost.png'] }

  it('posts the report route and clears busy', async () => {
    const { deps, calls } = fakeDeps([report])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(mediaReconcile, { deps, ops })

    expect(result.ok && result.result).toEqual(report)
    expect(calls).toEqual([{ path: '/admin/media/reconcile', method: 'POST', body: undefined, query: undefined }])
    expect(busyLog).toEqual([true, false])
  })

  it('sets the inline error and toasts on a failure', async () => {
    const message = 'media: not allowed'
    const { deps, toast } = fakeDeps([apiError(403, message)])
    const { ops, errors, busyLog } = fakeOps()

    const result = await runAction(mediaReconcile, { deps, ops })

    expect(result.ok).toBe(false)
    expect(errors).toContain(message)
    expect(toast.error).toHaveBeenCalledWith(message)
    expect(busyLog).toEqual([true, false])
  })
})

describe('mediaReconcileDelete', () => {
  it('fails the dialog guard and makes no request when not confirmed', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(mediaReconcileDelete, { deps, orphans: 2, confirmed: false, ops: fakeOps().ops })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls.length).toBe(0)
  })

  it('fails the dialog guard without orphans', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(mediaReconcileDelete, { deps, orphans: 0, confirmed: true, ops: fakeOps().ops })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls.length).toBe(0)
  })

  it('posts the delete route and toasts the deleted count', async () => {
    const { deps, calls, toast } = fakeDeps([{ blobsWithoutRow: ['media/stray.png'], rowsWithoutBlob: [] }])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(mediaReconcileDelete, { deps, orphans: 1, confirmed: true, ops })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/media/reconcile/delete', method: 'POST', body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('media.reconcile.deleteDone:{"count":1}')
    expect(busyLog).toEqual([true, false])
  })
})

const declaredSizes = [{ name: 'content', width: 1200, fit: 'inside' as const, format: 'webp' as const, quality: 82 }]

describe('imagesRegisterAndSync', () => {
  const job = { id: 'job1', state: 'running' as const, total: 10, done: 0, failed: 0, cursor: '', startedAt: 1, updatedAt: 1, finishedAt: null, error: null }

  it('registers before syncing, in that order, toasts, and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([undefined, job])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(imagesRegisterAndSync, { deps, sizes: declaredSizes, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      { path: '/admin/images/sizes', method: 'PUT', body: { sizes: declaredSizes }, query: undefined },
      { path: '/admin/images/sync', method: 'POST', body: undefined, query: undefined },
    ])
    expect(result.ok && result.result).toEqual(job)
    expect(toast.success).toHaveBeenCalledWith('images.syncStarted')
    expect(refreshCalls.length).toBe(1)
    expect(busyLog).toEqual([true, false])
  })

  it('a name collision on registration (409) does not fail the action and sync still runs and reloads', async () => {
    const message = 'images: size "content" is defined in config'
    const { deps, calls, toast } = fakeDeps([apiError(409, message), job])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(imagesRegisterAndSync, { deps, sizes: declaredSizes, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls.length).toBe(2)
    expect(calls[1]).toEqual({ path: '/admin/images/sync', method: 'POST', body: undefined, query: undefined })
    expect(result.ok && result.result).toEqual(job)
    expect(toast.error).not.toHaveBeenCalled()
    expect(refreshCalls.length).toBe(1)
  })

  it('skips registration when nothing is declared and still syncs', async () => {
    const { deps, calls } = fakeDeps([job])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    const result = await runAction(imagesRegisterAndSync, { deps, sizes: [], ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/admin/images/sync', method: 'POST', body: undefined, query: undefined }])
    expect(result.ok && result.result).toEqual(job)
  })

  it('is silent on a 409 from the sync half', async () => {
    const { deps, toast } = fakeDeps([undefined, apiError(409, 'images: sync job job1 is running')])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(imagesRegisterAndSync, { deps, sizes: declaredSizes, ops, refresh })

    expect(result.ok).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()
    expect(refreshCalls.length).toBe(1)
    expect(busyLog).toEqual([true, false])
  })

  it('toasts and fails when registration hits an error other than 409', async () => {
    const { deps, calls, toast } = fakeDeps([apiError(500, 'boom')])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(imagesRegisterAndSync, { deps, sizes: declaredSizes, ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(1)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(refreshCalls.length).toBe(0)
    expect(busyLog).toEqual([true, false])
  })
})
