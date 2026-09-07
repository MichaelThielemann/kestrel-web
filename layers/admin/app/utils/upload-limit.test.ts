import { describe, expect, it } from 'vitest'
import { exceedsUploadLimit } from './upload-limit'

describe('exceedsUploadLimit', () => {
  it('is true when the file size is over the limit', () => {
    expect(exceedsUploadLimit(100, 50)).toBe(true)
  })

  it('is false when the file size is within the limit', () => {
    expect(exceedsUploadLimit(50, 100)).toBe(false)
    expect(exceedsUploadLimit(100, 100)).toBe(false)
  })

  it('never exceeds when the limit is unknown', () => {
    expect(exceedsUploadLimit(Number.MAX_SAFE_INTEGER, null)).toBe(false)
  })
})
