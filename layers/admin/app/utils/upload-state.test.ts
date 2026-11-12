import { describe, expect, it } from 'vitest'
import type { Translate } from '#kestrel-admin/actions/types'
import { uploadStateView } from './upload-state'

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
