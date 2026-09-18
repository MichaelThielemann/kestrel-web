import { describe, expect, it } from 'vitest'
import { nextLimitState, uploadFailed, type UploadLimitState } from './useMediaUpload'

describe('uploadFailed', () => {
  it('fires for a non-401 error even when the server message is empty', () => {
    expect(uploadFailed({ status: 'error', message: '' })).toBe(true)
  })

  it('fires for a non-401 error with a message', () => {
    expect(uploadFailed({ status: 'error', message: 'file exceeds 5.0 MB' })).toBe(true)
  })

  it('stays quiet on the swallowed 401, where message is never set', () => {
    expect(uploadFailed({ status: 'error', message: undefined })).toBe(false)
  })

  it('stays quiet outside the error state', () => {
    expect(uploadFailed({ status: 'done', message: undefined })).toBe(false)
  })
})

describe('nextLimitState', () => {
  const unfetched: UploadLimitState = { maxUploadBytes: null, fetched: false, limitError: null }

  it('marks fetched and stores the limit on success, even when the limit is null (no limit)', () => {
    expect(nextLimitState(unfetched, { ok: true, maxUploadBytes: 5_000_000 })).toEqual({
      maxUploadBytes: 5_000_000, fetched: true, limitError: null,
    })
    expect(nextLimitState(unfetched, { ok: true, maxUploadBytes: null })).toEqual({
      maxUploadBytes: null, fetched: true, limitError: null,
    })
  })

  it('leaves fetched false and maxUploadBytes untouched on failure, so the next ensure() retries', () => {
    const next = nextLimitState(unfetched, { ok: false, message: 'network down' })
    expect(next).toEqual({ maxUploadBytes: null, fetched: false, limitError: 'network down' })
  })

  it('does not overwrite a previously fetched limit when a later refresh fails', () => {
    const fetchedOnce: UploadLimitState = { maxUploadBytes: 5_000_000, fetched: true, limitError: null }
    const next = nextLimitState(fetchedOnce, { ok: false, message: 'boom' })
    expect(next).toEqual({ maxUploadBytes: 5_000_000, fetched: true, limitError: 'boom' })
  })

  it('clears a stale limitError once a retry succeeds', () => {
    const failed: UploadLimitState = { maxUploadBytes: null, fetched: false, limitError: 'network down' }
    const next = nextLimitState(failed, { ok: true, maxUploadBytes: 1_000 })
    expect(next).toEqual({ maxUploadBytes: 1_000, fetched: true, limitError: null })
  })
})
