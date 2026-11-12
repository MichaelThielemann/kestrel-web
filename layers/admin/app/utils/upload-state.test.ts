import { describe, expect, it } from 'vitest'
import type { Translate } from '#kestrel-admin/actions/types'
import { uploadRunView, uploadStateView } from './upload-state'
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

  it('shows the percent of a running upload when the total is known, else an indeterminate bar', () => {
    const known = uploadStateView({ ...base, status: 'uploading', progress: 42, totalKnown: true }, t)
    const unknown = uploadStateView({ ...base, status: 'uploading', progress: 0, totalKnown: false }, t)

    expect(known.status.text).toBe('media.tile.percent {"percent":42}')
    expect(known.progress?.value).toBe(42)
    expect(known.progress?.label).toBe('media.upload.progressLabel {"name":"a.png"}')
    expect(unknown.status.text).toBe('media.upload.uploading')
    expect(unknown.progress?.value).toBeUndefined()
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
})

describe('uploadRunView', () => {
  const run = (...states: QueueEntry['status'][]) => uploadRunView(summarizeUploads(states.map((status, i) => ({ id: `${i}`, status, progress: 0, file: { size: 1 } }))), t)

  it('counts done and total while the run goes on, with a plain bar', () => {
    const view = run('done', 'uploading', 'queued')

    expect(view.countText).toBe('media.upload.summary {"done":1,"total":3}')
    expect(view.barTone).toBe('default')
  })

  it('calls a run done with a success check only when every file was uploaded', () => {
    const view = run('done', 'done')

    expect(view.finished).toEqual({ text: 'media.upload.done', icon: 'circle-check', tone: 'success' })
    expect(view.barTone).toBe('success')
  })

  it('calls a run with failures finished, with a failure icon and a danger bar', () => {
    const view = run('failed', 'failed')

    expect(view.countText).toBe('media.upload.summaryFailed {"done":0,"total":2,"failed":2}')
    expect(view.finished).toEqual({ text: 'media.upload.finished', icon: 'circle-x', tone: 'danger' })
    expect(view.barTone).toBe('danger')
  })

  it('counts cancelled files and does not call a cancelled run done', () => {
    expect(run('done', 'cancelled').countText).toBe('media.upload.summaryCancelled {"done":1,"total":2,"cancelled":1}')
    expect(run('done', 'cancelled').finished).toEqual({ text: 'media.upload.finished', icon: 'x', tone: 'muted' })
    expect(run('done', 'failed', 'cancelled').countText).toBe('media.upload.summaryFailedCancelled {"done":1,"total":3,"failed":1,"cancelled":1}')
  })
})
