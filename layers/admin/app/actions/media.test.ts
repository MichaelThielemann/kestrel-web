import type { ApiErrorDetails } from '#kestrel/types/api'
import { describe, expect, it, vi } from 'vitest'
import { runAction } from '../../../core/app/utils/actions'
import { createFolder, deleteItems, previewDeleteItems, renameOrMove, setMediaMeta, setMediaProvenance, upload } from './media'
import type { ActionDeps, ApiClient, ApiRequestOptions } from './types'
import type { UploadItem } from '../composables/useMediaUpload'

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
  let busy = false
  return { setBusy: vi.fn((on: boolean) => { busy = on }), busy: () => busy, setError: vi.fn(), setConflict: vi.fn() }
}

describe('createFolder', () => {
  it('creates a folder and refreshes', async () => {
    const { deps, calls } = fakeDeps([{ folder: 'a/b', count: 0 }])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(createFolder, { deps, path: 'a/b', ops, refresh })

    expect(result).toEqual({ ok: true, result: { folder: 'a/b', count: 0 } })
    expect(calls).toEqual([{ path: '/media/folders', method: 'POST', body: { path: 'a/b' }, query: undefined }])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('maps a 404 and skips the refresh', async () => {
    const { deps } = fakeDeps([apiError(404, 'nope')])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(createFolder, { deps, path: 'a/b', ops, refresh })

    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('media.folderNotFound')
    expect(refresh).not.toHaveBeenCalled()
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('maps a 409, dead for create but kept', async () => {
    const { deps } = fakeDeps([apiError(409, 'conflict')])
    const ops = fakeOps()

    await runAction(createFolder, { deps, path: 'a/b', ops, refresh: vi.fn(async () => undefined) })

    expect(ops.setError).toHaveBeenCalledWith('media.folderConflict')
  })

  it('passes a 500 message through unmapped', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const ops = fakeOps()

    await runAction(createFolder, { deps, path: 'a/b', ops, refresh: vi.fn(async () => undefined) })

    expect(ops.setError).toHaveBeenCalledWith('boom')
  })
})

describe('renameOrMove', () => {
  it('renames a file with no status mapping', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1', filename: 'new.jpg' }])
    const ops = fakeOps()

    const result = await runAction(renameOrMove, {
      deps, target: { kind: 'file-rename', id: 'f1', filename: 'new.jpg' }, notify: 'inline', ops, refresh: vi.fn(async () => undefined),
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/media/f1', method: 'PATCH', body: { filename: 'new.jpg' }, query: undefined }])
  })

  it('surfaces a raw 409 message for a file rename', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'filename taken')])
    const ops = fakeOps()

    const result = await runAction(renameOrMove, {
      deps, target: { kind: 'file-rename', id: 'f1', filename: 'new.jpg' }, notify: 'toast', ops, refresh: vi.fn(async () => undefined),
    })

    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('filename taken')
    expect(toast.error).toHaveBeenCalledWith('filename taken')
  })

  it('appends the runId to a server error toast', async () => {
    const { deps, toast } = fakeDeps([Object.assign(new Error('boom'), { status: 500, name: 'ApiError', data: { error: 'boom', runId: 'run-7' } })])
    const ops = fakeOps()

    await runAction(renameOrMove, {
      deps, target: { kind: 'file-rename', id: 'f1', filename: 'new.jpg' }, notify: 'toast', ops, refresh: vi.fn(async () => undefined),
    })

    expect(toast.error).toHaveBeenCalledWith('boom (run-7)')
    expect(ops.setError).toHaveBeenCalledWith('boom (run-7)')
  })

  it('renames a folder and maps a 409 through the shared mapper', async () => {
    const { deps, calls } = fakeDeps([apiError(409, 'exists')])
    const ops = fakeOps()

    const result = await runAction(renameOrMove, {
      deps, target: { kind: 'folder-rename', path: 'a/b', name: 'renamed' }, notify: 'inline', ops, refresh: vi.fn(async () => undefined),
    })

    expect(calls).toEqual([{ path: '/media/folders/a/b', method: 'PATCH', body: { path: 'a/renamed' }, query: undefined }])
    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('media.folderConflict')
  })

  it('moves two files with one PATCH each', async () => {
    const { deps, calls } = fakeDeps([{}, {}])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(renameOrMove, {
      deps,
      target: { kind: 'move', targets: [{ type: 'file', id: 'f1' }, { type: 'file', id: 'f2' }], dest: 'dst' },
      notify: 'toast',
      ops,
      refresh,
    })

    expect(result).toEqual({ ok: true, result: { moved: 2, failed: false, message: null, status: 0, code: '', retryable: false } })
    expect(calls).toEqual([
      { path: '/media/f1', method: 'PATCH', body: { folder: 'dst' }, query: undefined },
      { path: '/media/f2', method: 'PATCH', body: { folder: 'dst' }, query: undefined },
    ])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('skips a folder moved onto itself or into its own descendant', async () => {
    const { deps, calls } = fakeDeps([])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const intoSelf = await runAction(renameOrMove, {
      deps, target: { kind: 'move', targets: [{ type: 'folder', path: 'a/b' }], dest: 'a/b' }, notify: 'inline', ops, refresh,
    })
    const intoDescendant = await runAction(renameOrMove, {
      deps, target: { kind: 'move', targets: [{ type: 'folder', path: 'a' }], dest: 'a/b' }, notify: 'inline', ops, refresh,
    })

    expect(calls).toEqual([])
    expect(intoSelf).toEqual({ ok: true, result: { moved: 0, failed: false, message: null, status: 0, code: '', retryable: false } })
    expect(intoDescendant).toEqual({ ok: true, result: { moved: 0, failed: false, message: null, status: 0, code: '', retryable: false } })
  })

  it('stops a move at the first failed target', async () => {
    const { deps, calls } = fakeDeps([apiError(500, 'boom')])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(renameOrMove, {
      deps,
      target: { kind: 'move', targets: [{ type: 'file', id: 'f1' }, { type: 'file', id: 'f2' }], dest: 'dst' },
      notify: 'inline',
      ops,
      refresh,
    })

    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(ops.setError).toHaveBeenCalledWith('boom')
  })

  it('only toasts the failure when notify is toast', async () => {
    const { deps: inlineDeps, toast: inlineToast } = fakeDeps([apiError(500, 'boom')])
    await runAction(renameOrMove, {
      deps: inlineDeps, target: { kind: 'file-rename', id: 'f1', filename: 'x' }, notify: 'inline', ops: fakeOps(), refresh: vi.fn(async () => undefined),
    })
    expect(inlineToast.error).not.toHaveBeenCalled()

    const { deps: toastDeps, toast: toastToast } = fakeDeps([apiError(500, 'boom')])
    await runAction(renameOrMove, {
      deps: toastDeps, target: { kind: 'file-rename', id: 'f1', filename: 'x' }, notify: 'toast', ops: fakeOps(), refresh: vi.fn(async () => undefined),
    })
    expect(toastToast.error).toHaveBeenCalledWith('boom')
  })
})

describe('deleteItems', () => {
  const file = (id: string, filename: string) => ({
    id, filename, size: 1, key: id, contentType: 'image/png', folder: '', provenance: { origin: 'human' as const },
    checksum: null, status: 'ready' as const,
    createdAt: 1, updatedAt: 1, width: null, height: null, alt: null, title: null, description: null,
    variants: [],
  })

  it('does nothing when the dialog was not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png')], folderPaths: [], recursive: false, confirmed: false, ops: fakeOps(), refresh,
    })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('deletes two files and toasts the requested count', async () => {
    const { deps, calls, toast } = fakeDeps([null, null])
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png'), file('f2', 'b.png')], folderPaths: [], recursive: false, confirmed: true, ops: fakeOps(), refresh,
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      { path: '/media/f1', method: 'DELETE', body: undefined, query: undefined },
      { path: '/media/f2', method: 'DELETE', body: undefined, query: undefined },
    ])
    expect(toast.success).toHaveBeenCalledWith('media.deleted:{"n":2}')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('parses a 409 after a passed precheck and reports the referrers instead of the raw message', async () => {
    const { deps } = fakeDeps([apiError(409, 'media/f1 is referenced by pages/p1 (hero), pages/p2 (body)')])
    const refresh = vi.fn(async () => undefined)
    const ops = fakeOps()

    const result = await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png')], folderPaths: [], recursive: false, confirmed: true, ops, refresh,
    })

    expect(result.ok).toBe(false)
    expect(ops.setConflict).toHaveBeenCalledWith([
      { type: 'pages', id: 'p1', field: 'hero' },
      { type: 'pages', id: 'p2', field: 'body' },
    ])
    expect(ops.setError).not.toHaveBeenCalledWith(expect.stringContaining('media/f1 is referenced by'))
  })

  it('prefers details.referrers over the message when the CONFLICT body carries them', async () => {
    const { deps } = fakeDeps([apiError(409, 'media/f1 is still referenced', {
      referrers: [{ type: 'pages', id: 'p3', field: 'gallery' }],
    })])
    const ops = fakeOps()

    await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png')], folderPaths: [], recursive: false, confirmed: true, ops, refresh: vi.fn(async () => undefined),
    })

    expect(ops.setConflict).toHaveBeenCalledWith([{ type: 'pages', id: 'p3', field: 'gallery' }])
  })

  it('reloads exactly once per non-empty category, twice when both are non-empty', async () => {
    const filesOnly = fakeDeps([null])
    const filesOnlyRefresh = vi.fn(async () => undefined)
    await runAction(deleteItems, {
      deps: filesOnly.deps, files: [file('f1', 'a.png')], folderPaths: [], recursive: false, confirmed: true, ops: fakeOps(), refresh: filesOnlyRefresh,
    })
    expect(filesOnlyRefresh).toHaveBeenCalledTimes(1)

    const foldersOnly = fakeDeps([null])
    const foldersOnlyRefresh = vi.fn(async () => undefined)
    await runAction(deleteItems, {
      deps: foldersOnly.deps, files: [], folderPaths: ['a/b'], recursive: false, confirmed: true, ops: fakeOps(), refresh: foldersOnlyRefresh,
    })
    expect(foldersOnlyRefresh).toHaveBeenCalledTimes(1)

    const mixed = fakeDeps([null, null])
    const mixedRefresh = vi.fn(async () => undefined)
    await runAction(deleteItems, {
      deps: mixed.deps, files: [file('f1', 'a.png')], folderPaths: ['a/b'], recursive: false, confirmed: true, ops: fakeOps(), refresh: mixedRefresh,
    })
    expect(mixedRefresh).toHaveBeenCalledTimes(2)
  })

  it('stops the file loop at the first failure but still refreshes', async () => {
    const { deps, calls, toast } = fakeDeps([apiError(409, 'in use')])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png'), file('f2', 'b.png')], folderPaths: ['x'], recursive: false, confirmed: true, ops, refresh,
    })

    expect(result.ok).toBe(false)
    expect(calls).toEqual([{ path: '/media/f1', method: 'DELETE', body: undefined, query: undefined }])
    expect(ops.setError).toHaveBeenCalledWith('media.deleteBlocked:{"name":"a.png","reason":"in use"}')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('deletes folders after files and only sends recursive when asked', async () => {
    const { deps, calls } = fakeDeps([null])
    const refresh = vi.fn(async () => undefined)
    const result = await runAction(deleteItems, {
      deps, files: [], folderPaths: ['a/b'], recursive: true, confirmed: true, ops: fakeOps(), refresh,
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ path: '/media/folders/a/b', method: 'DELETE', body: undefined, query: { recursive: true } }])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops the folder loop at the first failure and does not attempt the rest', async () => {
    const { deps, calls } = fakeDeps([null, apiError(500, 'boom')])
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [], folderPaths: ['a', 'b', 'c'], recursive: false, confirmed: true, ops: fakeOps(), refresh,
    })

    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('previewDeleteItems', () => {
  it('skips the lookup when not allowed', async () => {
    const { deps, calls } = fakeDeps([])
    const result = await runAction(previewDeleteItems, { deps, fileIds: ['f1'], allowed: false })
    expect(calls).toEqual([])
    expect(result).toEqual({ ok: true, result: [] })
  })

  it('returns nothing and stops on a 403', async () => {
    const { deps, calls } = fakeDeps([apiError(403, 'forbidden')])
    const result = await runAction(previewDeleteItems, { deps, fileIds: ['f1', 'f2'], allowed: true })
    expect(calls).toHaveLength(1)
    expect(result).toEqual({ ok: true, result: [] })
  })

  it('skips a failed file and keeps the references of the others', async () => {
    const { deps, calls } = fakeDeps([apiError(500, 'boom'), [{ type: 'pages', field: 'body', id: 'p1' }], []])
    const result = await runAction(previewDeleteItems, { deps, fileIds: ['f1', 'f2', 'f3'], allowed: true })
    expect(calls).toHaveLength(3)
    expect(result).toEqual({ ok: true, result: [{ type: 'pages', field: 'body', id: 'p1' }] })
  })
})

describe('upload', () => {
  function uploadItem(overrides: Partial<UploadItem> = {}): UploadItem {
    return { id: 'u1', file: new File(['x'], 'a.png'), filename: 'a.png', folder: '', status: 'queued', ...overrides }
  }

  it('uploads with folder and provenance', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1' }])
    const item = uploadItem({ folder: 'a/b' })

    const result = await runAction(upload, { deps, item, provenance: { origin: 'ai', model: 'gpt' } })

    expect(result.ok).toBe(true)
    expect(item.status).toBe('done')
    expect(calls).toHaveLength(1)
    const body = calls[0]!.body as FormData
    expect(body.get('folder')).toBe('a/b')
    expect(JSON.parse(body.get('provenance') as string)).toEqual({ origin: 'ai', model: 'gpt' })
  })

  it('omits the folder field when there is none', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1' }])
    const item = uploadItem({ folder: '' })

    await runAction(upload, { deps, item })

    const body = calls[0]!.body as FormData
    expect(body.has('folder')).toBe(false)
  })

  it('sends a human origin for a plain upload', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1' }])
    const item = uploadItem()

    await runAction(upload, { deps, item, provenance: { origin: 'human' } })

    const body = calls[0]!.body as FormData
    expect(JSON.parse(body.get('provenance') as string)).toEqual({ origin: 'human' })
  })

  it('sends a human origin when the caller passes none', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1' }])
    const item = uploadItem()

    await runAction(upload, { deps, item })

    const body = calls[0]!.body as FormData
    expect(JSON.parse(body.get('provenance') as string)).toEqual({ origin: 'human' })
  })

  it('humanises byte counts in the 413 message', async () => {
    const { deps } = fakeDeps([apiError(413, 'file exceeds 5242880 bytes')])
    const item = uploadItem()

    await runAction(upload, { deps, item })

    expect(item.status).toBe('error')
    expect(item.message).toBe('media.uploadTooLarge:{"detail":"file exceeds 5.0 MB"}')
  })

  it('gives an unsupported type its own message', async () => {
    const { deps } = fakeDeps([apiError(415, 'type image/tiff is not allowed')])
    const item = uploadItem()

    await runAction(upload, { deps, item })

    expect(item.status).toBe('error')
    expect(item.message).toBe('media.uploadUnsupported:{"detail":"type image/tiff is not allowed"}')
  })

  it('leaves the message unset on a 401', async () => {
    const { deps } = fakeDeps([apiError(401, 'nope')])
    const item = uploadItem()

    await runAction(upload, { deps, item })

    expect(item.status).toBe('error')
    expect(item.message).toBeUndefined()
  })
})

describe('setMediaMeta', () => {
  it('patches locale and fields, then refreshes', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1' }])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(setMediaMeta, { deps, id: 'f1', locale: 'en', fields: { alt: 'a photo' }, ops, refresh })

    expect(result).toEqual({ ok: true, result: { id: 'f1' } })
    expect(calls).toEqual([{ path: '/media/f1', method: 'PATCH', body: { locale: 'en', alt: 'a photo' }, query: undefined }])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('reports the error and skips the refresh on failure', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(setMediaMeta, { deps, id: 'f1', locale: 'en', fields: { alt: 'a photo' }, ops, refresh })

    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('boom')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('setMediaProvenance', () => {
  it('patches provenance, then refreshes', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1' }])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(setMediaProvenance, { deps, id: 'f1', provenance: { origin: 'ai', model: 'gpt' }, ops, refresh })

    expect(result).toEqual({ ok: true, result: { id: 'f1' } })
    expect(calls).toEqual([{ path: '/media/f1', method: 'PATCH', body: { provenance: { origin: 'ai', model: 'gpt' } }, query: undefined }])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reports the error and skips the refresh on failure', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const ops = fakeOps()
    const refresh = vi.fn(async () => undefined)

    const result = await runAction(setMediaProvenance, { deps, id: 'f1', provenance: { origin: 'ai' }, ops, refresh })

    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('boom')
    expect(refresh).not.toHaveBeenCalled()
  })
})
