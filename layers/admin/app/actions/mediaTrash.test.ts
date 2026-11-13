import { describe, expect, it, vi } from 'vitest'
import { runAction } from '#kestrel-core/app/utils/actions'
import { emptyTrash, purgeItems, restoreItems, trashItems } from './mediaTrash'
import { fakeDeps, unansweredFetchError } from './__fixtures__/fake-deps'

const apiError = (status: number, message: string) => Object.assign(new Error(message), {
  status, name: 'ApiError', data: { error: message, code: status === 404 ? 'NOT_FOUND' : 'INTERNAL', retryable: false },
})

const ids = (n: number, prefix = 'f') => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

describe('trashItems', () => {
  it('sends the files in blocks of at most 200 ids and each folder once, then reloads once', async () => {
    const files = ids(201)
    const { deps, calls } = fakeDeps([
      { ids: files.slice(0, 200), skipped: [], unchanged: [] },
      { ids: [], skipped: [{ id: 'f200', reason: 'not_found' }], unchanged: [] },
      { path: 'docs', ids: ['d1', 'd2'], unchanged: [] },
    ])
    const refresh = vi.fn(() => undefined)
    const progress = vi.fn()

    const result = await runAction(trashItems, { deps, fileIds: files, folderPaths: ['docs'], refresh, onProgress: progress })

    expect(calls.map((c) => c.route)).toEqual([
      { method: 'POST', path: '/media/trash' },
      { method: 'POST', path: '/media/trash' },
      { method: 'POST', path: '/media/trash/folders/docs' },
    ])
    expect(calls[0]?.body).toEqual({ ids: files.slice(0, 200) })
    expect(calls[1]?.body).toEqual({ ids: ['f200'] })
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, result: {
      done: [...files.slice(0, 200), 'd1', 'd2'], unchanged: [], skipped: [{ id: 'f200', reason: 'not_found' }], failed: [], renamed: [], cancelled: false,
      unsent: [], folders: [{ path: 'docs', moved: ['d1', 'd2'] }],
    } })
  })

  it('keeps apart the ids that were in the trash already, also below a trashed folder', async () => {
    const { deps } = fakeDeps([
      { ids: ['a', 'x'], skipped: [], unchanged: ['x'] },
      { path: 'events', ids: ['new1', 'new2', 'old'], unchanged: ['old'] },
      { path: 'drafts', ids: [], unchanged: [] },
    ])

    const result = await runAction(trashItems, { deps, fileIds: ['a', 'x'], folderPaths: ['events', 'drafts'], refresh: vi.fn(() => undefined) })

    expect(result.ok && result.result?.unchanged).toEqual(['x', 'old'])
    expect(result.ok && result.result?.folders).toEqual([{ path: 'events', moved: ['new1', 'new2'] }, { path: 'drafts', moved: [] }])
  })

  it('names the files and folders it never sent after the signal aborted', async () => {
    const controller = new AbortController()
    const files = ids(450)
    const { deps, calls } = fakeDeps([{ ids: files.slice(0, 200), skipped: [], unchanged: [] }])

    const result = await runAction(trashItems, {
      deps, fileIds: files, folderPaths: ['docs'], refresh: vi.fn(() => undefined), signal: controller.signal, onProgress: () => controller.abort(),
    })

    expect(calls).toHaveLength(1)
    expect(result.ok && result.result?.cancelled).toBe(true)
    expect(result.ok && result.result?.unsent).toEqual([...files.slice(200), 'docs'])
  })

  it('hands its report out before the reload, so a failed reload does not lose what the server did', async () => {
    const { deps } = fakeDeps([{ ids: ['a'], skipped: [], unchanged: [] }])
    const report = vi.fn()

    const result = await runAction(trashItems, {
      deps, fileIds: ['a'], folderPaths: [], report, refresh: () => Promise.reject(new Error('reload failed')),
    })

    expect(result.ok).toBe(false)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ done: ['a'] }))
  })

  it('reports every id of a failed block and keeps going with the next one', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom'), apiError(404, 'gone')])

    const result = await runAction(trashItems, { deps, fileIds: ['a', 'b'], folderPaths: ['old'], refresh: vi.fn(() => undefined) })

    expect(result.ok && result.result?.failed).toEqual([
      { id: 'a', message: 'boom', status: 500, code: 'INTERNAL', reached: true },
      { id: 'b', message: 'boom', status: 500, code: 'INTERNAL', reached: true },
      { id: 'old', message: 'gone', status: 404, code: 'NOT_FOUND', reached: true },
    ])
  })

  it('keeps the error id of a block that got no answer and marks it as not reaching the server', async () => {
    const { deps } = fakeDeps([unansweredFetchError('0a0b0c0d0e0f')])

    const result = await runAction(trashItems, { deps, fileIds: ['a'], folderPaths: [], refresh: vi.fn(() => undefined) })

    expect(result.ok && result.result?.failed).toEqual([
      { id: 'a', message: 'Request failed', status: 0, code: 'INTERNAL', reached: false, requestId: '0a0b0c0d0e0f' },
    ])
  })
})

describe('restoreItems', () => {
  it('passes renamed items through', async () => {
    const { deps, calls } = fakeDeps([{ ids: ['a'], skipped: [], renamed: [{ id: 'a', from: 'x.png', to: 'x-2.png' }], unchanged: [] }])

    const result = await runAction(restoreItems, { deps, ids: ['a'] })

    expect(calls).toEqual([{ route: { method: 'POST', path: '/media/trash/restore' }, body: { ids: ['a'] }, query: undefined }])
    expect(result.ok && result.result?.renamed).toEqual([{ id: 'a', from: 'x.png', to: 'x-2.png' }])
  })
})

describe('purgeItems', () => {
  it('stops between blocks once the signal aborts and says so', async () => {
    const controller = new AbortController()
    const { deps, calls } = fakeDeps([{ ids: ids(200), skipped: [] }])

    const result = await runAction(purgeItems, {
      deps, ids: ids(250), onProgress: () => controller.abort(), signal: controller.signal,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.route).toEqual({ method: 'POST', path: '/media/trash/purge' })
    expect(result.ok && result.result?.cancelled).toBe(true)
  })

  it('keeps a referenced item as skipped', async () => {
    const { deps } = fakeDeps([{ ids: ['a'], skipped: [{ id: 'b', reason: 'referenced' }] }])

    const result = await runAction(purgeItems, { deps, ids: ['a', 'b'] })

    expect(result.ok && result.result).toEqual({
      done: ['a'], unchanged: [], skipped: [{ id: 'b', reason: 'referenced' }], failed: [], renamed: [], cancelled: false, unsent: [], folders: [],
    })
  })
})

describe('emptyTrash', () => {
  it('posts once without ids', async () => {
    const { deps, calls } = fakeDeps([{ ids: ['a'], skipped: [] }])

    await runAction(emptyTrash, { deps })

    expect(calls).toEqual([{ route: { method: 'POST', path: '/media/trash/empty' }, body: {}, query: undefined }])
  })
})
