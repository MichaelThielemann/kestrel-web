import { describe, expect, it } from 'vitest'
import type { Translate } from '#kestrel-admin/actions/types'
import { uploadRunView, uploadStateView, uploadVariantPhase, type UploadVariantPhase } from './upload-state'
import { summarizeUploads, type QueueEntry } from './upload-queue'

const t: Translate = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key)
const base = { filename: 'a.png', progress: 0 }

describe('uploadStateView', () => {
  it('shows a waiting upload muted, with a clock and no bar', () => {
    const view = uploadStateView({ ...base, status: 'queued' }, t)

    expect(view.tone).toBe('muted')
    expect(view.status).toEqual({ text: 'media.tile.queued', icon: 'clock', tone: 'muted' })
    expect(view.progress).toBeUndefined()
  })

  it('says a running upload is uploading, with the percent on its bar when the total is known, else an indeterminate bar', () => {
    const known = uploadStateView({ ...base, status: 'uploading', progress: 42, totalKnown: true }, t)
    const unknown = uploadStateView({ ...base, status: 'uploading', progress: 0, totalKnown: false }, t)

    expect(known.status).toEqual({ text: 'media.upload.uploading', busy: true })
    expect(known.progress).toEqual({ value: 42, label: 'media.upload.progressLabel {"name":"a.png"}', valueText: 'media.tile.percent {"percent":42}' })
    expect(unknown.status).toEqual({ text: 'media.upload.uploading', busy: true })
    expect(unknown.progress?.value).toBeUndefined()
    expect(unknown.progress?.valueText).toBe('media.upload.uploading')
  })

  it('shows a spinner while the server processes the file', () => {
    const view = uploadStateView({ ...base, status: 'processing', progress: 100 }, t)

    expect(view.status).toEqual({ text: 'media.tile.processing', busy: true })
    expect(view.progress).toMatchObject({ value: 100, label: 'media.upload.progressLabel {"name":"a.png"}' })
  })

  it('shows a finished upload with a check and no bar', () => {
    const view = uploadStateView({ ...base, status: 'done', progress: 100 }, t)

    expect(view.status).toEqual({ text: 'media.upload.done', icon: 'circle-check', tone: 'success' })
    expect(view.progress).toBeUndefined()
  })

  it('shows a failed upload with its message and no bar', () => {
    const view = uploadStateView({ ...base, status: 'failed', message: 'No connection to the server' }, t)

    expect(view.tone).toBe('danger')
    expect(view.status).toEqual({ text: 'media.upload.failed', icon: 'circle-x', tone: 'danger' })
    expect(view.message).toBe('No connection to the server')
    expect(view.progress).toBeUndefined()
  })

  it('shows a cancelled upload muted, without repeating its message', () => {
    const view = uploadStateView({ ...base, status: 'cancelled', message: 'Cancelled' }, t)

    expect(view.tone).toBe('muted')
    expect(view.status.text).toBe('media.upload.cancelled')
    expect(view.message).toBeUndefined()
  })

  it('shows a file skipped for its size muted, with the reason and no bar', () => {
    const view = uploadStateView({ ...base, status: 'skipped', message: 'Too large (60.0 MB, limit 20.0 MB)' }, t)

    expect(view.tone).toBe('muted')
    expect(view.status).toEqual({ text: 'media.upload.wasSkipped', icon: 'minus', tone: 'muted' })
    expect(view.message).toBe('Too large (60.0 MB, limit 20.0 MB)')
    expect(view.progress).toBeUndefined()
  })
})

describe('uploadRunView', () => {
  const run = (...states: QueueEntry['status'][]) => {
    const items = states.map((status, i) => ({ id: `${i}`, status, progress: 0, file: { size: 1 } }))
    return uploadRunView(summarizeUploads(items), t, items)
  }

  it('counts done and total next to a spinner while the run goes on, with a plain bar', () => {
    const view = run('done', 'uploading', 'queued')

    expect(view.countText).toBe('media.upload.summary {"done":1,"total":3}')
    expect(view.status).toEqual({ text: 'media.upload.summary {"done":1,"total":3}', busy: true })
    expect(view.liveText).toBe(view.countText)
    expect(view.barTone).toBe('default')
  })

  it('calls a run done with a success check only when every file was uploaded', () => {
    const view = run('done', 'done')

    expect(view.status).toEqual({ text: 'media.upload.doneCount {"done":2,"total":2}', icon: 'circle-check', tone: 'success' })
    expect(view.trail).toBeUndefined()
    expect(view.barTone).toBe('success')
  })

  it('calls a run with failures finished, with a failure icon and a danger bar', () => {
    const view = run('failed', 'failed')

    expect(view.countText).toBe('media.upload.summary {"done":0,"total":2}, media.upload.countFailed {"n":2}')
    expect(view.status).toEqual({ text: 'media.upload.finished', icon: 'circle-x', tone: 'danger' })
    expect(view.trail).toBe(view.countText)
    expect(view.liveText).toBe(`media.upload.finished. ${view.countText}`)
    expect(view.barTone).toBe('danger')
  })

  it('counts cancelled files and does not call a cancelled run done', () => {
    expect(run('done', 'cancelled').countText).toBe('media.upload.summary {"done":1,"total":2}, media.upload.countCancelled {"n":1}')
    expect(run('done', 'cancelled').status).toEqual({ text: 'media.upload.finished', icon: 'x', tone: 'muted' })
    expect(run('done', 'failed', 'cancelled').countText).toBe('media.upload.summary {"done":1,"total":3}, media.upload.countFailed {"n":1}, media.upload.countCancelled {"n":1}')
  })

  it('calls a run done when every file sent was uploaded, and counts the skipped ones apart', () => {
    const view = run('done', 'done', 'skipped')

    expect(view.countText).toBe('media.upload.summary {"done":2,"total":2}, media.upload.countSkipped {"n":1}')
    expect(view.status).toEqual({ text: 'media.upload.doneCount {"done":2,"total":2}', icon: 'circle-check', tone: 'success' })
    expect(view.trail).toBe('media.upload.countSkipped {"n":1}')
    expect(view.barTone).toBe('success')
  })

  it('puts the files settled and the share sent of the running ones into the overall percent, leaving skipped files out', () => {
    const items: QueueEntry[] = [
      { id: 'a', status: 'done', progress: 100, file: { size: 1 } },
      { id: 'b', status: 'uploading', progress: 50, file: { size: 1 } },
      { id: 'c', status: 'skipped', progress: 0, file: { size: 1 } },
    ]

    expect(uploadRunView(summarizeUploads(items), t, items).overall).toBe(75)
  })
})

const counts = (done: number, pending: number, error = 0, failed = 0) => ({ done, pending, error, failed })
const image = (status: QueueEntry['status']) => ({ status, file: { type: 'image/jpeg' }, result: status === 'done' ? { contentType: 'image/jpeg' } : undefined })

describe('uploadVariantPhase', () => {
  it('has no variant phase while the images feature is off', () => {
    expect(uploadVariantPhase(image('processing'), { images: false })).toEqual({ kind: 'none' })
    expect(uploadVariantPhase(image('done'), { images: false, source: { variantCounts: counts(0, 4) } })).toEqual({ kind: 'none' })
  })

  it('has no variant phase for a file that is not an image', () => {
    const pdf = { status: 'done' as const, file: { type: 'application/pdf' }, result: { contentType: 'application/pdf' } }

    expect(uploadVariantPhase({ ...pdf, status: 'processing' }, { images: true })).toEqual({ kind: 'none' })
    expect(uploadVariantPhase(pdf, { images: true, source: { variantCounts: counts(0, 0) } })).toEqual({ kind: 'none' })
  })

  it('has no variant phase before the body is sent or after a failure', () => {
    expect(uploadVariantPhase(image('queued'), { images: true })).toEqual({ kind: 'none' })
    expect(uploadVariantPhase(image('uploading'), { images: true })).toEqual({ kind: 'none' })
    expect(uploadVariantPhase(image('failed'), { images: true })).toEqual({ kind: 'none' })
  })

  it('is pending without counts while the server still answers an image upload', () => {
    expect(uploadVariantPhase(image('processing'), { images: true })).toEqual({ kind: 'pending' })
  })

  it('is pending without counts when the response carries none', () => {
    expect(uploadVariantPhase(image('done'), { images: true })).toEqual({ kind: 'pending' })
  })

  it('is pending with the done and total counts while sizes are outstanding', () => {
    expect(uploadVariantPhase(image('done'), { images: true, source: { variantCounts: counts(3, 5) } })).toEqual({ kind: 'pending', done: 3, total: 8 })
  })

  it('stays pending while the original is not available, without counts when there are none', () => {
    expect(uploadVariantPhase(image('done'), { images: true, source: { variantCounts: counts(8, 0), available: false } })).toEqual({ kind: 'pending', done: 8, total: 8 })
    expect(uploadVariantPhase(image('done'), { images: true, source: { variantCounts: counts(0, 0), available: false } })).toEqual({ kind: 'pending' })
  })

  it('is ready once every size is done', () => {
    expect(uploadVariantPhase(image('done'), { images: true, source: { variantCounts: counts(8, 0), available: true } })).toEqual({ kind: 'ready' })
  })

  it('has no variant phase for an image with no sizes to generate', () => {
    expect(uploadVariantPhase(image('done'), { images: true, source: { variantCounts: counts(0, 0), available: true } })).toEqual({ kind: 'none' })
  })

  it('is failed with the number of errored and failed sizes once none is pending', () => {
    expect(uploadVariantPhase(image('done'), { images: true, source: { variantCounts: counts(6, 0, 1, 1) } })).toEqual({ kind: 'failed', failed: 2, total: 8 })
  })

  it('is stalled when the poller gave up waiting, whatever the counts say', () => {
    expect(uploadVariantPhase(image('done'), { images: true, source: { variantCounts: counts(2, 6) }, stalled: true })).toEqual({ kind: 'stalled' })
  })
})

describe('uploadStateView with a variant phase', () => {
  const done = { ...base, status: 'done' as const, progress: 100 }

  it('shows a spinner, "Generating variants…" and an indeterminate bar while the server answers an image upload', () => {
    const view = uploadStateView({ ...base, status: 'processing', progress: 100 }, t, { phase: { kind: 'pending' } })

    expect(view.status).toEqual({ text: 'media.upload.processing', busy: true })
    expect(view.progress).toEqual({ label: 'media.upload.progressLabel {"name":"a.png"}', valueText: 'media.upload.processing' })
  })

  it('shows the done and total variants as text, as a determinate bar and as its value text', () => {
    const view = uploadStateView(done, t, { phase: { kind: 'pending', done: 3, total: 8 } })

    expect(view.status).toEqual({ text: 'media.upload.variantsProgress {"done":3,"total":8}', busy: true })
    expect(view.progress).toEqual({ value: 37.5, label: 'media.upload.progressLabel {"name":"a.png"}', valueText: 'media.upload.variantsValue {"done":3,"total":8}' })
    expect(view.tone).toBe('default')
  })

  it('shows a finished image with a check, Done and no bar once its variants are ready', () => {
    const view = uploadStateView(done, t, { phase: { kind: 'ready' } })

    expect(view.status).toEqual({ text: 'media.upload.done', icon: 'circle-check', tone: 'success' })
    expect(view.progress).toBeUndefined()
  })

  it('shows failed variants with a warning icon, the count and where to retry them', () => {
    const retry = uploadStateView(done, t, { phase: { kind: 'failed', failed: 2, total: 8 }, canRetry: true })
    const ask = uploadStateView(done, t, { phase: { kind: 'failed', failed: 2, total: 8 } })

    expect(retry.status).toEqual({ text: 'media.upload.variantsFailedCount {"n":2,"total":8}', icon: 'triangle-alert', tone: 'warning' })
    expect(retry.message).toBe('media.tile.variantsFailedRetry')
    expect(ask.message).toBe('media.tile.variantsFailedAsk')
    expect(retry.progress).toBeUndefined()
  })

  it('shows delayed variants muted with a clock and the longer hint as message', () => {
    const view = uploadStateView(done, t, { phase: { kind: 'stalled' } })

    expect(view.status).toEqual({ text: 'media.tile.variantsStalledShort', icon: 'clock', tone: 'muted' })
    expect(view.message).toBe('media.tile.variantsStalled')
  })

  it('shows a file without variants as plain processing, then Done', () => {
    expect(uploadStateView({ ...base, status: 'processing', progress: 100 }, t, { phase: { kind: 'none' } }).status).toEqual({ text: 'media.tile.processing', busy: true })
    expect(uploadStateView(done, t, { phase: { kind: 'none' } }).status).toEqual({ text: 'media.upload.done', icon: 'circle-check', tone: 'success' })
  })

  it('keeps a failed upload failed whatever phase is passed', () => {
    const view = uploadStateView({ ...base, status: 'failed', message: 'boom' }, t, { phase: { kind: 'pending' } })

    expect(view.status).toEqual({ text: 'media.upload.failed', icon: 'circle-x', tone: 'danger' })
  })
})

describe('uploadRunView with variant phases', () => {
  const finished = (phases: UploadVariantPhase[], ...extra: QueueEntry['status'][]) => {
    const items: QueueEntry[] = [...phases.map(() => 'done' as const), ...extra].map((status, i) => ({ id: `${i}`, status, progress: 100, file: { size: 1 } }))
    return uploadRunView(summarizeUploads(items), t, items, phases)
  }

  it('shows the variant phase with files done of files with variants while any is pending, and no success bar', () => {
    const view = finished([{ kind: 'ready' }, { kind: 'pending', done: 1, total: 8 }, { kind: 'pending' }, { kind: 'none' }])

    expect(view.status).toEqual({ text: 'media.upload.variantsFiles {"done":1,"total":3}', busy: true })
    expect(view.countText).toBe('media.upload.summary {"done":4,"total":4}')
    expect(view.detail).toBeUndefined()
    expect(view.barTone).toBe('default')
  })

  it('tells screen readers that variants are generated without the per-file counts', () => {
    const first = finished([{ kind: 'pending', done: 1, total: 8 }, { kind: 'pending' }])
    const later = finished([{ kind: 'ready' }, { kind: 'pending', done: 7, total: 8 }])

    expect(first.liveText).toBe('media.upload.summary {"done":2,"total":2}. media.upload.processing')
    expect(later.liveText).toBe(first.liveText)
  })

  it('says Done with a success check and bar once every file has its variants', () => {
    const view = finished([{ kind: 'ready' }, { kind: 'ready' }, { kind: 'none' }])

    expect(view.status).toEqual({ text: 'media.upload.doneCount {"done":3,"total":3}', icon: 'circle-check', tone: 'success' })
    expect(view.liveText).toBe('media.upload.doneCount {"done":3,"total":3}')
    expect(view.barTone).toBe('success')
  })

  it('warns once nothing is pending when some files have failed variants, naming how many', () => {
    const view = finished([{ kind: 'ready' }, { kind: 'failed', failed: 2, total: 8 }])

    expect(view.status).toEqual({ text: 'media.upload.doneCount {"done":2,"total":2}', icon: 'triangle-alert', tone: 'warning' })
    expect(view.detail).toBe('media.upload.variantsFailedFiles {"n":1,"total":2}')
    expect(view.liveText).toContain(view.detail)
    expect(view.barTone).toBe('default')
  })

  it('marks delayed variants with a clock and names how many files they hold up', () => {
    const view = finished([{ kind: 'stalled' }, { kind: 'ready' }])

    expect(view.status).toEqual({ text: 'media.upload.doneCount {"done":2,"total":2}', icon: 'clock', tone: 'muted' })
    expect(view.detail).toBe('media.upload.variantsStalledFiles {"n":1,"total":2}')
  })

  it('counts a single file in the singular', () => {
    expect(finished([{ kind: 'pending' }]).status.text).toBe('media.upload.variantsFilesOne {"done":0,"total":1}')
    expect(finished([{ kind: 'failed', failed: 1, total: 4 }]).detail).toBe('media.upload.variantsFailedFilesOne {"n":1,"total":1}')
    expect(finished([{ kind: 'stalled' }]).detail).toBe('media.upload.variantsStalledFilesOne {"n":1,"total":1}')
  })

  it('does not count delayed files as done while others are pending', () => {
    const view = finished([{ kind: 'stalled' }, { kind: 'pending' }, { kind: 'ready' }])

    expect(view.status.text).toBe('media.upload.variantsFiles {"done":1,"total":3}')
  })

  it('keeps the upload count beside the variant phase while variants are pending', () => {
    const pending = finished([{ kind: 'pending' }, { kind: 'ready' }])
    expect(pending.trail).toBe('media.upload.summary {"done":2,"total":2}')
    const withFailure = finished([{ kind: 'pending' }], 'failed')
    expect(withFailure.trail).toBe(withFailure.countText)
    const withSkipped = finished([{ kind: 'pending' }], 'skipped')
    expect(withSkipped.trail).toBe(withSkipped.countText)
  })

  it('drops the upload count once the variants are through and every file was uploaded', () => {
    expect(finished([{ kind: 'ready' }, { kind: 'ready' }]).trail).toBeUndefined()
    expect(finished([{ kind: 'failed', failed: 1, total: 4 }]).trail).toBeUndefined()
  })

  it('keeps the upload failure as status and the variant failure as detail', () => {
    const view = finished([{ kind: 'failed', failed: 1, total: 4 }], 'failed')

    expect(view.status).toEqual({ text: 'media.upload.finished', icon: 'circle-x', tone: 'danger' })
    expect(view.detail).toBe('media.upload.variantsFailedFilesOne {"n":1,"total":1}')
    expect(view.barTone).toBe('danger')
  })

  it('shows the upload count, not the variant phase, while files still upload', () => {
    const items: QueueEntry[] = [{ id: 'a', status: 'done', progress: 100, file: { size: 1 } }, { id: 'b', status: 'uploading', progress: 10, file: { size: 1 } }]
    const view = uploadRunView(summarizeUploads(items), t, items, [{ kind: 'pending', done: 0, total: 8 }])

    expect(view.status).toEqual({ text: 'media.upload.summary {"done":1,"total":2}', busy: true })
  })
})
