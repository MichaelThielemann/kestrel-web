import { describe, expect, it } from 'vitest'
import { uploadFailed } from './useMediaUpload'

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
