import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import type { Capability } from '#kestrel-admin/types/kestrel'
import { describe, expect, it, vi } from 'vitest'
import { boundaryCast } from '#kestrel/cast'
import { runAction } from '#kestrel-core/app/utils/actions'
import { createFolder, deleteItems, previewDeleteItems, renameOrMove, setMediaMeta, setMediaProvenance, upload } from './media'
import type { UploadItem } from '../composables/useMediaUpload'
import type { UploadProgress, UploadTransport } from '../composables/useUploadTransport'
import type { ApiRoute } from '../utils/capabilities'
import { fakeDeps } from './__fixtures__/fake-deps'

const MEDIA_REFERRERS: Capability = { method: 'GET', path: '/admin/references/to/media/:id' }

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
  return { setBusy: vi.fn((on: boolean) => { busy = on }), busy: () => busy, setError: vi.fn(), setConflict: vi.fn() }
}

describe('createFolder', () => {
  it('creates a folder and refreshes', async () => {
    const { deps, calls } = fakeDeps([{ folder: 'a/b', count: 0 }])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

    const result = await runAction(createFolder, { deps, path: 'a/b', ops, refresh })

    expect(result).toEqual({ ok: true, result: { folder: 'a/b', count: 0 } })
    expect(calls).toEqual([{ route: { method: 'POST', path: '/media/folders' }, body: { path: 'a/b' }, query: undefined }])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('maps a 404 and skips the refresh', async () => {
    const { deps } = fakeDeps([apiError(404, 'nope')])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

    const result = await runAction(createFolder, { deps, path: 'a/b', ops, refresh })

    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('media.folderNotFound')
    expect(refresh).not.toHaveBeenCalled()
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('maps a 409, dead for create but kept', async () => {
    const { deps } = fakeDeps([apiError(409, 'conflict')])
    const ops = fakeOps()

    await runAction(createFolder, { deps, path: 'a/b', ops, refresh: vi.fn(() => undefined) })

    expect(ops.setError).toHaveBeenCalledWith('media.folderConflict')
  })

  it('passes a 500 message through unmapped', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const ops = fakeOps()

    await runAction(createFolder, { deps, path: 'a/b', ops, refresh: vi.fn(() => undefined) })

    expect(ops.setError).toHaveBeenCalledWith('boom')
  })
})

describe('renameOrMove', () => {
  it('renames a file with no status mapping', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1', filename: 'new.jpg' }])
    const ops = fakeOps()

    const result = await runAction(renameOrMove, {
      deps, target: { kind: 'file-rename', id: 'f1', filename: 'new.jpg' }, notify: 'inline', ops, refresh: vi.fn(() => undefined),
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'PATCH', path: '/media/f1' }, body: { filename: 'new.jpg' }, query: undefined }])
  })

  it('surfaces a raw 409 message for a file rename', async () => {
    const { deps, toast } = fakeDeps([apiError(409, 'filename taken')])
    const ops = fakeOps()

    const result = await runAction(renameOrMove, {
      deps, target: { kind: 'file-rename', id: 'f1', filename: 'new.jpg' }, notify: 'toast', ops, refresh: vi.fn(() => undefined),
    })

    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('filename taken')
    expect(toast.error).toHaveBeenCalledWith('filename taken')
  })

  it('appends the runId to a server error toast', async () => {
    const { deps, toast } = fakeDeps([Object.assign(new Error('boom'), { status: 500, name: 'ApiError', data: { error: 'boom', runId: 'run-7' } })])
    const ops = fakeOps()

    await runAction(renameOrMove, {
      deps, target: { kind: 'file-rename', id: 'f1', filename: 'new.jpg' }, notify: 'toast', ops, refresh: vi.fn(() => undefined),
    })

    expect(toast.error).toHaveBeenCalledWith('boom (run-7)')
    expect(ops.setError).toHaveBeenCalledWith('boom (run-7)')
  })

  it('renames a folder and maps a 409 through the shared mapper', async () => {
    const { deps, calls } = fakeDeps([apiError(409, 'exists')])
    const ops = fakeOps()

    const result = await runAction(renameOrMove, {
      deps, target: { kind: 'folder-rename', path: 'a/b', name: 'renamed' }, notify: 'inline', ops, refresh: vi.fn(() => undefined),
    })

    expect(calls).toEqual([{ route: { method: 'PATCH', path: '/media/folders/a/b' }, body: { path: 'a/renamed' }, query: undefined }])
    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('media.folderConflict')
  })

  it('moves two files with one PATCH each', async () => {
    const { deps, calls } = fakeDeps([{}, {}])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

    const result = await runAction(renameOrMove, {
      deps,
      target: { kind: 'move', targets: [{ type: 'file', id: 'f1' }, { type: 'file', id: 'f2' }], dest: 'dst' },
      notify: 'toast',
      ops,
      refresh,
    })

    expect(result).toEqual({ ok: true, result: { moved: 2, failed: false, message: null, status: 0, code: '', retryable: false } })
    expect(calls).toEqual([
      { route: { method: 'PATCH', path: '/media/f1' }, body: { folder: 'dst' }, query: undefined },
      { route: { method: 'PATCH', path: '/media/f2' }, body: { folder: 'dst' }, query: undefined },
    ])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('skips a folder moved onto itself or into its own descendant', async () => {
    const { deps, calls } = fakeDeps([])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

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
    const refresh = vi.fn(() => undefined)

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
      deps: inlineDeps, target: { kind: 'file-rename', id: 'f1', filename: 'x' }, notify: 'inline', ops: fakeOps(), refresh: vi.fn(() => undefined),
    })
    expect(inlineToast.error).not.toHaveBeenCalled()

    const { deps: toastDeps, toast: toastToast } = fakeDeps([apiError(500, 'boom')])
    await runAction(renameOrMove, {
      deps: toastDeps, target: { kind: 'file-rename', id: 'f1', filename: 'x' }, notify: 'toast', ops: fakeOps(), refresh: vi.fn(() => undefined),
    })
    expect(toastToast.error).toHaveBeenCalledWith('boom')
  })
})

describe('deleteItems', () => {
  const file = (id: string, filename: string) => ({
    id, filename, size: 1, key: id, contentType: 'image/png', folder: '', provenance: { origin: 'human' as const },
    checksum: null, status: 'ready' as const,
    createdAt: 1, updatedAt: 1, width: null, height: null, alt: null, title: null, description: null,
    variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
    variants: [],
    variantCounts: { done: 0, pending: 0, error: 0, failed: 0 },
  })

  it('does nothing when the dialog was not confirmed', async () => {
    const { deps, calls } = fakeDeps([])
    const refresh = vi.fn(() => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png')], folderPaths: [], recursive: false, confirmed: false, ops: fakeOps(), refresh,
    })

    expect(result).toEqual({ ok: false, error: 'dialog.confirm' })
    expect(calls).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('deletes two files and toasts the requested count', async () => {
    const { deps, calls, toast } = fakeDeps([null, null])
    const refresh = vi.fn(() => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png'), file('f2', 'b.png')], folderPaths: [], recursive: false, confirmed: true, ops: fakeOps(), refresh,
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      { route: { method: 'DELETE', path: '/media/f1' }, body: undefined, query: undefined },
      { route: { method: 'DELETE', path: '/media/f2' }, body: undefined, query: undefined },
    ])
    expect(toast.success).toHaveBeenCalledWith('media.deleted:{"n":2}')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('parses a 409 after a passed precheck and reports the referrers instead of the raw message', async () => {
    const { deps } = fakeDeps([apiError(409, 'media/f1 is referenced by pages/p1 (hero), pages/p2 (body)')])
    const refresh = vi.fn(() => undefined)
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
      deps, files: [file('f1', 'a.png')], folderPaths: [], recursive: false, confirmed: true, ops, refresh: vi.fn(() => undefined),
    })

    expect(ops.setConflict).toHaveBeenCalledWith([{ type: 'pages', id: 'p3', field: 'gallery' }])
  })

  it('reloads exactly once per non-empty category, twice when both are non-empty', async () => {
    const filesOnly = fakeDeps([null])
    const filesOnlyRefresh = vi.fn(() => undefined)
    await runAction(deleteItems, {
      deps: filesOnly.deps, files: [file('f1', 'a.png')], folderPaths: [], recursive: false, confirmed: true, ops: fakeOps(), refresh: filesOnlyRefresh,
    })
    expect(filesOnlyRefresh).toHaveBeenCalledTimes(1)

    const foldersOnly = fakeDeps([null])
    const foldersOnlyRefresh = vi.fn(() => undefined)
    await runAction(deleteItems, {
      deps: foldersOnly.deps, files: [], folderPaths: ['a/b'], recursive: false, confirmed: true, ops: fakeOps(), refresh: foldersOnlyRefresh,
    })
    expect(foldersOnlyRefresh).toHaveBeenCalledTimes(1)

    const mixed = fakeDeps([null, null])
    const mixedRefresh = vi.fn(() => undefined)
    await runAction(deleteItems, {
      deps: mixed.deps, files: [file('f1', 'a.png')], folderPaths: ['a/b'], recursive: false, confirmed: true, ops: fakeOps(), refresh: mixedRefresh,
    })
    expect(mixedRefresh).toHaveBeenCalledTimes(2)
  })

  it('stops the file loop at the first failure but still refreshes', async () => {
    const { deps, calls, toast } = fakeDeps([apiError(409, 'in use')])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [file('f1', 'a.png'), file('f2', 'b.png')], folderPaths: ['x'], recursive: false, confirmed: true, ops, refresh,
    })

    expect(result.ok).toBe(false)
    expect(calls).toEqual([{ route: { method: 'DELETE', path: '/media/f1' }, body: undefined, query: undefined }])
    expect(ops.setError).toHaveBeenCalledWith('media.deleteBlocked:{"name":"a.png","reason":"in use"}')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('deletes folders after files and only sends recursive when asked', async () => {
    const { deps, calls } = fakeDeps([null])
    const refresh = vi.fn(() => undefined)
    const result = await runAction(deleteItems, {
      deps, files: [], folderPaths: ['a/b'], recursive: true, confirmed: true, ops: fakeOps(), refresh,
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ route: { method: 'DELETE', path: '/media/folders/a/b' }, body: undefined, query: { recursive: true } }])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops the folder loop at the first failure and does not attempt the rest', async () => {
    const { deps, calls } = fakeDeps([null, apiError(500, 'boom')])
    const refresh = vi.fn(() => undefined)

    const result = await runAction(deleteItems, {
      deps, files: [], folderPaths: ['a', 'b', 'c'], recursive: false, confirmed: true, ops: fakeOps(), refresh,
    })

    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('previewDeleteItems', () => {
  it('skips the lookup when the collection has no referrers route', async () => {
    const { deps, calls } = fakeDeps([])
    const result = await runAction(previewDeleteItems, { deps, fileIds: ['f1'], capability: undefined })
    expect(calls).toEqual([])
    expect(result).toEqual({ ok: true, result: [] })
  })

  it('returns nothing and stops on a 403', async () => {
    const { deps, calls } = fakeDeps([apiError(403, 'forbidden')])
    const result = await runAction(previewDeleteItems, { deps, fileIds: ['f1', 'f2'], capability: MEDIA_REFERRERS })
    expect(calls).toHaveLength(1)
    expect(result).toEqual({ ok: true, result: [] })
  })

  it('skips a failed file and keeps the references of the others', async () => {
    const { deps, calls } = fakeDeps([apiError(500, 'boom'), [{ type: 'pages', field: 'body', id: 'p1' }], []])
    const result = await runAction(previewDeleteItems, { deps, fileIds: ['f1', 'f2', 'f3'], capability: MEDIA_REFERRERS })
    expect(calls).toHaveLength(3)
    expect(result).toEqual({ ok: true, result: [{ type: 'pages', field: 'body', id: 'p1' }] })
  })
})

describe('upload', () => {
  interface TransportCall { route: ApiRoute, body: FormData }

  function uploadItem(overrides: Partial<UploadItem> = {}): UploadItem {
    return { id: 'u1', file: new File(['x'], 'a.png'), filename: 'a.png', folder: '', status: 'queued', progress: 0, ...overrides }
  }

  function fakeTransport(responses: Array<unknown | Error>) {
    const calls: TransportCall[] = []
    const transport: UploadTransport = <T>(route: ApiRoute, body: FormData) => {
      calls.push({ route, body })
      const next = responses.shift()
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(boundaryCast<T>(next, 'json'))
    }
    return { transport, calls }
  }

  function formDataString(body: FormData, key: string): string {
    const value = body.get(key)
    if (typeof value !== 'string') throw new Error(`expected "${key}" to be a string field`)
    return value
  }

  it('uploads with folder and provenance', async () => {
    const { deps } = fakeDeps()
    const { transport, calls } = fakeTransport([{ id: 'f1' }])
    const item = uploadItem({ folder: 'a/b' })

    const result = await runAction(upload, { deps, item, provenance: { origin: 'ai', model: 'gpt' }, transport })

    expect(result.ok).toBe(true)
    expect(item.status).toBe('done')
    expect(item.progress).toBe(100)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.route).toEqual({ method: 'POST', path: '/media' })
    const body = calls[0]!.body
    expect(body.get('folder')).toBe('a/b')
    expect(JSON.parse(formDataString(body, 'provenance'))).toEqual({ origin: 'ai', model: 'gpt' })
  })

  it('keeps the response body on the upload entry', async () => {
    const { deps } = fakeDeps()
    const { transport } = fakeTransport([{ id: 'f1', filename: 'a.png' }])
    const item = uploadItem()

    await runAction(upload, { deps, item, transport })

    expect(item.result).toEqual({ id: 'f1', filename: 'a.png' })
  })

  it('leaves the response unset on a failed upload', async () => {
    const { deps } = fakeDeps()
    const { transport } = fakeTransport([apiError(500, 'boom')])
    const item = uploadItem()

    await runAction(upload, { deps, item, transport })

    expect(item.result).toBeUndefined()
  })

  it('omits the folder field when there is none', async () => {
    const { deps } = fakeDeps()
    const { transport, calls } = fakeTransport([{ id: 'f1' }])
    const item = uploadItem({ folder: '' })

    await runAction(upload, { deps, item, transport })

    expect(calls[0]!.body.has('folder')).toBe(false)
  })

  it('sends a human origin for a plain upload', async () => {
    const { deps } = fakeDeps()
    const { transport, calls } = fakeTransport([{ id: 'f1' }])
    const item = uploadItem()

    await runAction(upload, { deps, item, provenance: { origin: 'human' }, transport })

    expect(JSON.parse(formDataString(calls[0]!.body, 'provenance'))).toEqual({ origin: 'human' })
  })

  it('sends a human origin when the caller passes none', async () => {
    const { deps } = fakeDeps()
    const { transport, calls } = fakeTransport([{ id: 'f1' }])
    const item = uploadItem()

    await runAction(upload, { deps, item, transport })

    expect(JSON.parse(formDataString(calls[0]!.body, 'provenance'))).toEqual({ origin: 'human' })
  })

  it('tracks percent as it arrives and switches to processing once the transport reports 100%', async () => {
    const { deps } = fakeDeps()
    const item = uploadItem()
    let sawProcessingBeforeSettling = false
    let deliver: (value: { id: string }) => void = () => {}
    const transport: UploadTransport = <T>(_route: ApiRoute, _body: FormData, onProgress?: (progress: UploadProgress) => void) => {
      onProgress?.({ loaded: 5, total: 10, percent: 50 })
      return new Promise<T>((resolve) => {
        deliver = (value) => {
          onProgress?.({ loaded: 10, total: 10, percent: 100 })
          sawProcessingBeforeSettling = item.status === 'processing'
          resolve(boundaryCast<T>(value, 'json'))
        }
      })
    }

    expect(item.progress).toBe(0)
    const pending = runAction(upload, { deps, item, transport })
    await vi.waitFor(() => expect(item.progress).toBe(50))
    expect(item.status).toBe('uploading')

    deliver({ id: 'f1' })
    await pending

    expect(sawProcessingBeforeSettling).toBe(true)
    expect(item.status).toBe('done')
    expect(item.progress).toBe(100)
  })

  it('marks the total unknown when the transport cannot compute progress', async () => {
    const { deps } = fakeDeps()
    const { transport } = fakeTransport([{ id: 'f1' }])
    const item = uploadItem()
    const originalTransport = transport
    const nonComputable: UploadTransport = <T>(path: string, body: FormData, onProgress?: (progress: UploadProgress) => void) => {
      onProgress?.({ loaded: 5, total: 0, percent: 0 })
      return originalTransport<T>(path, body, onProgress)
    }

    await runAction(upload, { deps, item, transport: nonComputable })

    expect(item.totalKnown).toBe(false)
  })

  it('marks the total known once the transport reports a real total', async () => {
    const { deps } = fakeDeps()
    const item = uploadItem()
    const transport: UploadTransport = <T>(_path: string, _body: FormData, onProgress?: (progress: UploadProgress) => void) => {
      onProgress?.({ loaded: 5, total: 10, percent: 50 })
      return Promise.resolve(boundaryCast<T>({ id: 'f1' }, 'json'))
    }

    await runAction(upload, { deps, item, transport })

    expect(item.totalKnown).toBe(true)
  })

  it('humanises byte counts in the 413 message', async () => {
    const { deps } = fakeDeps()
    const { transport } = fakeTransport([apiError(413, 'file exceeds 5242880 bytes')])
    const item = uploadItem()

    await runAction(upload, { deps, item, transport })

    expect(item.status).toBe('failed')
    expect(item.message).toBe('media.uploadTooLarge:{"detail":"file exceeds 5.0 MB"}')
  })

  it('gives an unsupported type its own message', async () => {
    const { deps } = fakeDeps()
    const { transport } = fakeTransport([apiError(415, 'type image/tiff is not allowed')])
    const item = uploadItem()

    await runAction(upload, { deps, item, transport })

    expect(item.status).toBe('failed')
    expect(item.message).toBe('media.uploadUnsupported:{"detail":"type image/tiff is not allowed"}')
  })

  it('leaves the message unset on a 401', async () => {
    const { deps } = fakeDeps()
    const { transport } = fakeTransport([apiError(401, 'nope')])
    const item = uploadItem()

    await runAction(upload, { deps, item, transport })

    expect(item.status).toBe('failed')
    expect(item.message).toBeUndefined()
  })
})

describe('setMediaMeta', () => {
  it('patches locale and fields, then refreshes', async () => {
    const { deps, calls } = fakeDeps([{ id: 'f1' }])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

    const result = await runAction(setMediaMeta, { deps, id: 'f1', locale: 'en', fields: { alt: 'a photo' }, ops, refresh })

    expect(result).toEqual({ ok: true, result: { id: 'f1' } })
    expect(calls).toEqual([{ route: { method: 'PATCH', path: '/media/f1' }, body: { locale: 'en', alt: 'a photo' }, query: undefined }])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(ops.setBusy.mock.calls).toEqual([[true], [false]])
  })

  it('reports the error and skips the refresh on failure', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

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
    const refresh = vi.fn(() => undefined)

    const result = await runAction(setMediaProvenance, { deps, id: 'f1', provenance: { origin: 'ai', model: 'gpt' }, ops, refresh })

    expect(result).toEqual({ ok: true, result: { id: 'f1' } })
    expect(calls).toEqual([{ route: { method: 'PATCH', path: '/media/f1' }, body: { provenance: { origin: 'ai', model: 'gpt' } }, query: undefined }])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reports the error and skips the refresh on failure', async () => {
    const { deps } = fakeDeps([apiError(500, 'boom')])
    const ops = fakeOps()
    const refresh = vi.fn(() => undefined)

    const result = await runAction(setMediaProvenance, { deps, id: 'f1', provenance: { origin: 'ai' }, ops, refresh })

    expect(result.ok).toBe(false)
    expect(ops.setError).toHaveBeenCalledWith('boom')
    expect(refresh).not.toHaveBeenCalled()
  })
})
