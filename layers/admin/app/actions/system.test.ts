import type { ApiErrorDetails, AdminSchema } from '#kestrel-admin/types/api'
import { describe, expect, it, vi } from 'vitest'
import { runAction } from '#kestrel-core/app/utils/actions'
import { humanizeSize } from '../utils/library'
import {
  eventsRetryAll,
  eventsRetryOne,
  exportMedia,
  imagesRegisterAndSync,
  imagesRetryFailed,
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
  retryStale,
  userCreate,
  userDelete,
  userToggle,
  userUpdate,
} from './system'
import type { BusyPort } from './types'
import { capabilityResolver } from '../utils/capabilities'
import { fakeDeps as sharedFakeDeps, fullAccessSchema } from './__fixtures__/fake-deps'

const CODE_OF: Record<number, string> = {
  400: 'VALIDATION', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED', 429: 'RATE_LIMITED', 500: 'INTERNAL', 503: 'TRANSIENT',
}

const apiError = (status: number, message: string, details?: ApiErrorDetails) => Object.assign(new Error(message), {
  status,
  name: 'ApiError',
  data: { error: message, code: CODE_OF[status] ?? 'INTERNAL', retryable: status === 429 || status === 503, ...(details ? { details } : {}) },
})

const migrationsAndEventsSchema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  features: [],
  collections: [],
  capabilities: {
    applyMigrations: { method: 'POST', path: '/admin/migrations/apply' },
    eventsRetryDead: { method: 'POST', path: '/admin/events/retry' },
    eventsRetryOne: { method: 'POST', path: '/admin/events/dead/:id/retry' },
  },
}
const migrationsAndEventsCapabilities = capabilityResolver(migrationsAndEventsSchema)

function fakeDeps(responses: Array<unknown | Error> = []) {
  return sharedFakeDeps(responses)
}

function fakeMigrationsOrEventsDeps(responses: Array<unknown | Error> = []) {
  return sharedFakeDeps(responses, migrationsAndEventsCapabilities)
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
  it('queues every page for a re-render and reports how many it marked', async () => {
    const { deps, calls, toast } = fakeDeps([{ marked: 12 }])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(publishAll, { deps, ops })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/publish-all/pages' }, body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('delivery.queued:{"marked":12}')
    expect(busyLog).toEqual([true, false])
    expect(result.ok && result.result?.marked).toBe(12)
  })

  it('re-renders every mounted collection through its own publish-all and reports the combined count', async () => {
    const withBlog = capabilityResolver({ ...fullAccessSchema, collections: fullAccessSchema.collections.map((c) => (c.name === 'blog' ? { ...c, capabilities: { ...c.capabilities, publishAll: { method: 'POST', path: '/admin/publish-all/blog' } } } : c)) })
    const { deps, calls, toast } = sharedFakeDeps([{ marked: 12 }, { marked: 5 }], withBlog)
    const { ops } = fakeOps()

    const result = await runAction(publishAll, { deps, ops, collections: ['pages', 'blog', 'settings'] })

    expect(calls.map((call) => call.route.path)).toEqual(['/admin/publish-all/pages', '/admin/publish-all/blog'])
    expect(result.ok && result.result?.marked).toBe(17)
    expect(toast.success).toHaveBeenCalledWith('delivery.queued:{"marked":17}')
  })

  it('reports a single queued page in the singular', async () => {
    const { deps, toast } = fakeDeps([{ marked: 1 }])
    const { ops } = fakeOps()

    await runAction(publishAll, { deps, ops })

    expect(toast.success).toHaveBeenCalledWith('delivery.queuedOne:{"marked":1}')
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

describe('retryStale', () => {
  it('queues the failed re-renders again and reports how many', async () => {
    const { deps, calls, toast } = fakeDeps([{ retried: 3 }])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(retryStale, { deps, ops })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/publish-stale/pages/retry' }, body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('delivery.retried:{"retried":3}')
    expect(busyLog).toEqual([true, false])
    expect(result.ok && result.result?.retried).toBe(3)
  })

  it('reports a single page queued again in the singular', async () => {
    const { deps, toast } = fakeDeps([{ retried: 1 }])
    const { ops } = fakeOps()

    await runAction(retryStale, { deps, ops })

    expect(toast.success).toHaveBeenCalledWith('delivery.retriedOne:{"retried":1}')
  })

  it('toasts the error and fails the action', async () => {
    const { deps, toast } = fakeDeps([apiError(503, 'store busy')])
    const { ops, busyLog } = fakeOps()

    const result = await runAction(retryStale, { deps, ops })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalled()
    expect(busyLog).toEqual([true, false])
  })
})

describe('exportMedia', () => {
  it('exports and toasts the media and variant counts', async () => {
    const { deps, calls, toast } = fakeDeps([{ written: 4, skipped: 1, missing: 0, conflicts: 2, variants: { written: 6, skipped: 3 } }])
    const { ops } = fakeOps()

    const result = await runAction(exportMedia, { deps, ops })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/media/export' }, body: undefined, query: undefined }])
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
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/replication/snapshot' }, body: undefined, query: undefined }])
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

    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/replication/restore' }, body: { generation: 'g7' }, query: undefined }])
  })

  it('restores by time and carries restartRequired, then reloads', async () => {
    const { deps, calls } = fakeDeps([{ generation: 7, at: 1000, file: 'db.snap', restartRequired: true }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(replicationRestore, { deps, point: { at: 1000 }, ops, refresh })

    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/replication/restore' }, body: { at: 1000 }, query: undefined }])
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
    const { deps, calls } = fakeMigrationsOrEventsDeps([{ dry: true, changes: [{ id: '2026-09-02-example', documents: 3 }] }])
    const { ops } = fakeOps()

    const result = await runAction(migrationsDryRun, { deps, ops })

    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/migrations/apply' }, body: { dry: true }, query: undefined }])
    expect(result.ok && result.result?.changes).toEqual([{ id: '2026-09-02-example', documents: 3 }])
  })

  it('toasts and fails on error', async () => {
    const { deps, toast } = fakeMigrationsOrEventsDeps([apiError(500, 'boom')])
    const { ops } = fakeOps()

    const result = await runAction(migrationsDryRun, { deps, ops })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
  })
})

describe('migrationsApply', () => {
  it('fails the dialog guard and makes no request when not confirmed', async () => {
    const { deps, calls } = fakeMigrationsOrEventsDeps([])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(migrationsApply, { deps, confirmed: false, ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(refreshCalls.length).toBe(0)
  })

  it('applies, toasts the count, and reloads', async () => {
    const { deps, calls, toast } = fakeMigrationsOrEventsDeps([{ applied: [{ id: '2026-09-02-example', appliedAt: 1000, documents: 3, durationMs: 12 }] }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(migrationsApply, { deps, confirmed: true, ops, refresh })

    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/migrations/apply' }, body: { dry: false }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('migrations.applyDone:{"count":1}')
    expect(result.ok && result.result?.applied.length).toBe(1)
    expect(refreshCalls.length).toBe(1)
  })

  it('toasts and skips the reload on error', async () => {
    const { deps, toast } = fakeMigrationsOrEventsDeps([apiError(500, 'boom')])
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

    const result = await runAction(userCreate, { deps, username: '  ', password: 'long-enough-phrase', passwordConfirm: 'long-enough-phrase', roles: [], ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(errors).toEqual(['users.usernameRequired'])
    expect(refreshCalls.length).toBe(0)
  })

  it('fails validation on a short password without a request', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(userCreate, { deps, username: 'bob', password: 'elevenchars', passwordConfirm: 'elevenchars', roles: [], ops, refresh })

    expect(calls.length).toBe(0)
    expect(errors).toEqual(['users.passwordTooShort'])
  })

  it('fails validation when the confirmation does not match, without a request', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userCreate, { deps, username: 'bob', password: 'long-enough-phrase', passwordConfirm: 'different', roles: [], ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(errors).toEqual(['password.mismatch'])
    expect(refreshCalls.length).toBe(0)
  })

  it('creates the user with the trimmed username, toasts and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ id: 'u1' }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userCreate, { deps, username: '  bob  ', password: 'long-enough-phrase', passwordConfirm: 'long-enough-phrase', roles: ['editor'], ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/users' }, body: { username: 'bob', password: 'long-enough-phrase', roles: ['editor'] }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('users.created')
    expect(refreshCalls.length).toBe(1)
  })

  it('sets the inline error without a toast on failure and skips the reload', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'username taken')])
    const { ops, errors } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userCreate, { deps, username: 'bob', password: 'long-enough-phrase', passwordConfirm: 'long-enough-phrase', roles: [], ops, refresh })

    expect(result.ok).toBe(false)
    expect(errors).toContain('username taken')
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(refreshCalls.length).toBe(0)
  })
})

describe('referencesRebuild', () => {
  it('rebuilds, toasts the report and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ documents: 5, entries: 12 }])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(referencesRebuild, { deps, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/references/rebuild' }, body: undefined, query: undefined }])
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
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/links/rebuild' }, body: undefined, query: undefined }])
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
    expect(calls).toEqual([{ route: { method: 'POST', path: '/users/u1/deactivate' }, body: undefined, query: undefined }])
    expect(busyLog).toEqual([true, false])
    expect(order).toEqual(['refresh', 'busy:off'])
  })

  it('activates an inactive user', async () => {
    const { deps, calls } = fakeDeps([undefined])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(userToggle, { deps, userId: 'u1', active: false, ops, refresh })

    expect(calls).toEqual([{ route: { method: 'POST', path: '/users/u1/activate' }, body: undefined, query: undefined }])
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

describe('userUpdate', () => {
  const initial = { username: 'bob', roles: ['editor'], active: true }

  it('fails validation on a blank username without a request', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()
    const { refresh } = fakeRefresh()

    const result = await runAction(userUpdate, { deps, userId: 'u1', username: '  ', roles: ['editor'], active: true, password: '', passwordConfirm: '', initial, ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(errors).toEqual(['users.usernameRequired'])
  })

  it('fails validation on a short password without a request', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops, errors } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(userUpdate, { deps, userId: 'u1', username: 'bob', roles: ['editor'], active: true, password: 'elevenchars', passwordConfirm: 'elevenchars', initial, ops, refresh })

    expect(calls.length).toBe(0)
    expect(errors).toEqual(['users.passwordTooShort'])
  })

  it('patches only the changed fields with the trimmed username', async () => {
    const { deps, calls, toast } = fakeDeps([{ id: 'u1' }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userUpdate, { deps, userId: 'u1', username: '  ada  ', roles: ['editor'], active: true, password: '', passwordConfirm: '', initial, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'PATCH', path: '/users/u1' }, body: { username: 'ada' }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('users.saved')
    expect(refreshCalls.length).toBe(1)
  })

  it('sends roles, the deactivation and the new password in that order', async () => {
    const { deps, calls } = fakeDeps([{ id: 'u1' }, undefined, undefined])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(userUpdate, { deps, userId: 'u1', username: 'bob', roles: ['admin', 'editor'], active: false, password: 'long-enough-phrase', passwordConfirm: 'long-enough-phrase', initial, ops, refresh })

    expect(calls).toEqual([
      { route: { method: 'PATCH', path: '/users/u1' }, body: { roles: ['admin', 'editor'] }, query: undefined },
      { route: { method: 'POST', path: '/users/u1/deactivate' }, body: undefined, query: undefined },
      { route: { method: 'PUT', path: '/users/u1/password' }, body: { password: 'long-enough-phrase' }, query: undefined },
    ])
  })

  it('makes no request at all when nothing changed', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userUpdate, { deps, userId: 'u1', username: 'bob', roles: ['editor'], active: true, password: '', passwordConfirm: '', initial, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls.length).toBe(0)
    expect(refreshCalls.length).toBe(1)
  })

  it('shows the localized message on a taken username and stops before the password', async () => {
    const { deps, calls } = fakeDeps([apiError(409, 'username already exists')])
    const { ops, errors, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userUpdate, { deps, userId: 'u1', username: 'ada', roles: ['editor'], active: true, password: 'long-enough-phrase', passwordConfirm: 'long-enough-phrase', initial, ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(1)
    expect(errors).toContain('users.nameTaken')
    expect(refreshCalls.length).toBe(0)
    expect(busyLog).toEqual([true, false])
  })

  it('shows the last-administrator message when the role change is refused', async () => {
    const { deps } = fakeDeps([Object.assign(new Error('the last admin must keep users.manage'), {
      status: 409,
      name: 'ApiError',
      data: { error: 'the last admin must keep users.manage', code: 'LAST_ADMIN', retryable: false },
    })])
    const { ops, errors } = fakeOps()
    const { refresh } = fakeRefresh()

    await runAction(userUpdate, { deps, userId: 'u1', username: 'bob', roles: [], active: true, password: '', passwordConfirm: '', initial, ops, refresh })

    expect(errors).toContain('users.lastAdminRoles')
  })
})

describe('userDelete', () => {
  it('makes no request while the dialog is not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: null, confirmed: false, ops, refresh })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
  })

  it('anonymises by default, toasts the outcome and reloads', async () => {
    const { deps, calls, toast } = fakeDeps([{ ok: true, reassignTo: null }])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: null, confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'DELETE', path: '/users/u1' }, body: { reassignTo: null }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('users.deletedAnonymized')
    expect(refreshCalls.length).toBe(1)
    expect(busyLog).toEqual([true, false])
  })

  it('sends the chosen target and names it in the toast', async () => {
    const { deps, calls, toast } = fakeDeps([{ ok: true, reassignTo: { id: 'u2', name: 'berta' } }])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: 'u2', confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(result.ok && result.result).toEqual({ reassignTo: { id: 'u2', name: 'berta' }, events: null })
    expect(calls).toEqual([{ route: { method: 'DELETE', path: '/users/u1' }, body: { reassignTo: 'u2' }, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('users.deletedReassigned:{"username":"berta"}')
  })

  it('reports a failed follow-up task after deleting a user', async () => {
    const events = {
      status: 'error',
      pipelines: [
        { event: 'user.deleted', pipeline: 'reassignRevisionAuthor', status: 'error', attempts: 1, dead: true, error: 'user u2 not found' },
        { event: 'user.deleted', pipeline: 'anonymizeAuditUser', status: 'done', attempts: 1, dead: false, error: null },
      ],
    }
    const { deps, toast } = fakeDeps([{ ok: true, reassignTo: null, _events: events }])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: null, confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(toast.error).toHaveBeenCalledWith(
      'users.deletedFollowUpFailed:{"pipelines":"reassignRevisionAuthor"}users.followUpSeeEvents:{"tab":"system.tabs.events"}',
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reports follow-up tasks still running after deleting a user', async () => {
    const events = { status: 'pending', pipelines: [{ event: 'user.deleted', pipeline: 'reassignRevisionAuthor', status: 'pending', attempts: 0, dead: false, error: null }] }
    const { deps, toast } = fakeDeps([{ ok: true, reassignTo: null, _events: events }])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: null, confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(toast.info).toHaveBeenCalledWith('users.deletedFollowUpPending')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('confirms a user deletion whose follow-up tasks are done', async () => {
    const events = { status: 'done', pipelines: [{ event: 'user.deleted', pipeline: 'anonymizeAuditUser', status: 'done', attempts: 1, dead: false, error: null }] }
    const { deps, toast } = fakeDeps([{ ok: true, reassignTo: null, _events: events }])
    const { ops } = fakeOps()
    const { refresh } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: null, confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('users.deletedAnonymized')
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('shows the self-protection message and skips the reload', async () => {
    const { deps } = fakeDeps([apiError(400, 'you cannot delete yourself')])
    const { ops, errors } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: null, confirmed: true, ops, refresh })

    expect(result.ok).toBe(false)
    expect(errors).toContain('users.cannotDeleteSelf')
    expect(refreshCalls.length).toBe(0)
  })

  it('explains an unusable target and keeps the user', async () => {
    const { deps } = fakeDeps([apiError(400, 'reassignTo must be an active user')])
    const { ops, errors } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: 'u2', confirmed: true, ops, refresh })

    expect(result.ok).toBe(false)
    expect(errors).toContain('users.reassignUnusable')
    expect(refreshCalls.length).toBe(0)
  })

  it('explains an unknown target and keeps the user', async () => {
    const { deps } = fakeDeps([apiError(404, 'user u2 not found')])
    const { ops, errors } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(userDelete, { deps, userId: 'u1', reassignTo: 'u2', confirmed: true, ops, refresh })

    expect(result.ok).toBe(false)
    expect(errors).toContain('users.reassignUnknown')
    expect(refreshCalls.length).toBe(0)
  })
})

describe('previewPrune', () => {
  it('fills the result from orphaned and calls exactly GET /admin/images/status', async () => {
    const { deps, calls } = fakeDeps([{ sizes: [], job: null, orphaned: { sizes: ['old-size'], variants: 5 } }])

    const result = await runAction(previewPrune, { deps })

    expect(result.ok).toBe(true)
    expect(result.ok && result.result).toEqual({ sizes: ['old-size'], variants: 5 })
    expect(calls).toEqual([{ route: { method: 'GET', path: '/admin/images/status' }, body: undefined, query: undefined }])
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
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/images/prune' }, body: { sizes: ['old-size', 'stale'] }, query: undefined }])
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

describe('imagesRetryFailed', () => {
  it('fails the dialog guard and makes no request when nothing failed', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(imagesRetryFailed, { deps, variants: 0, confirmed: true, ops: fakeOps().ops, refresh: fakeRefresh().refresh })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls.length).toBe(0)
  })

  it('fails the dialog guard and makes no request when not confirmed', async () => {
    const { deps, calls } = fakeDeps([])

    const result = await runAction(imagesRetryFailed, { deps, variants: 4, confirmed: false, ops: fakeOps().ops, refresh: fakeRefresh().refresh })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls.length).toBe(0)
  })

  it('posts the retry route, toasts the counts, reloads and clears busy', async () => {
    const { deps, calls, toast } = fakeDeps([{ variants: 4, media: 2, job: null }])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(imagesRetryFailed, { deps, variants: 4, confirmed: true, ops, refresh })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/images/retry-failed' }, body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('images.retryFailedDone:{"variants":4,"media":2}')
    expect(refreshCalls.length).toBe(1)
    expect(busyLog).toEqual([true, false])
  })

  it('sets the inline error and skips the reload on a 409, and clears busy', async () => {
    const message = 'images: shutting down'
    const { deps, toast } = fakeDeps([apiError(409, message)])
    const { ops, errors, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(imagesRetryFailed, { deps, variants: 4, confirmed: true, ops, refresh })

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
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/media/reconcile' }, body: undefined, query: undefined }])
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
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/media/reconcile/delete' }, body: undefined, query: undefined }])
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
      { route: { method: 'PUT', path: '/admin/images/sizes' }, body: { sizes: declaredSizes }, query: undefined },
      { route: { method: 'POST', path: '/admin/images/sync' }, body: undefined, query: undefined },
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
    expect(calls[1]).toEqual({ route: { method: 'POST', path: '/admin/images/sync' }, body: undefined, query: undefined })
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
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/images/sync' }, body: undefined, query: undefined }])
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

describe('eventsRetryAll', () => {
  it('retries all, toasts the count and reloads', async () => {
    const { deps, calls, toast } = fakeMigrationsOrEventsDeps([{ retried: 3 }])
    const { ops, busyLog } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(eventsRetryAll, { deps, ops, refresh, count: 3 })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/events/retry' }, body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('events.retriedAll:{"count":3}')
    expect(refreshCalls.length).toBe(1)
    expect(busyLog).toEqual([true, false])
  })

  it('fails the dialog guard and makes no request when count is 0', async () => {
    const { deps, calls } = fakeMigrationsOrEventsDeps([])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(eventsRetryAll, { deps, ops, refresh, count: 0 })

    expect(result.ok).toBe(false)
    expect(calls.length).toBe(0)
    expect(refreshCalls.length).toBe(0)
  })

  it('toasts the raw error message and skips the reload', async () => {
    const { deps, toast } = fakeMigrationsOrEventsDeps([apiError(500, 'boom')])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(eventsRetryAll, { deps, ops, refresh, count: 2 })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(refreshCalls.length).toBe(0)
  })
})

describe('eventsRetryOne', () => {
  it('retries one event, toasts and reloads', async () => {
    const { deps, calls, toast } = fakeMigrationsOrEventsDeps([{ retried: 1 }])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(eventsRetryOne, { deps, ops, refresh, id: 'evt-1' })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'POST', path: '/admin/events/dead/evt-1/retry' }, body: undefined, query: undefined }])
    expect(toast.success).toHaveBeenCalledWith('events.retriedOne')
    expect(refreshCalls.length).toBe(1)
  })

  it('toasts events.retryNotFound on a 404 and skips the reload', async () => {
    const { deps, toast } = fakeMigrationsOrEventsDeps([apiError(404, 'nope')])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(eventsRetryOne, { deps, ops, refresh, id: 'evt-1' })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('events.retryNotFound')
    expect(refreshCalls.length).toBe(0)
  })

  it('toasts the raw error message on any other error', async () => {
    const { deps, toast } = fakeMigrationsOrEventsDeps([apiError(500, 'boom')])
    const { ops } = fakeOps()
    const { refresh, calls: refreshCalls } = fakeRefresh()

    const result = await runAction(eventsRetryOne, { deps, ops, refresh, id: 'evt-1' })

    expect(result.ok).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(refreshCalls.length).toBe(0)
  })
})
