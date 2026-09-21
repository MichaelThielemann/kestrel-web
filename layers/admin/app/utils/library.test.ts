import { describe, expect, it } from 'vitest'
import { humanizeSize, humanizeSizeOrDash } from './library'

describe('humanizeSizeOrDash', () => {
  it('humanizes a defined byte count the same way humanizeSize does', () => {
    expect(humanizeSizeOrDash(123456)).toBe(humanizeSize(123456))
  })

  it('renders an em dash for an absent byte count instead of treating it as zero', () => {
    expect(humanizeSizeOrDash(undefined)).toBe('—')
  })
})
