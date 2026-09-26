import { describe, expect, it } from 'vitest'
import { parseMediaTypeFilter } from './library'

describe('parseMediaTypeFilter', () => {
  it('accepts each of the declared type filter values', () => {
    expect(parseMediaTypeFilter('all')).toBe('all')
    expect(parseMediaTypeFilter('image')).toBe('image')
    expect(parseMediaTypeFilter('video')).toBe('video')
    expect(parseMediaTypeFilter('other')).toBe('other')
  })

  it('falls back to "all" for an unknown value', () => {
    expect(parseMediaTypeFilter('nonsense')).toBe('all')
    expect(parseMediaTypeFilter(undefined)).toBe('all')
    expect(parseMediaTypeFilter(42)).toBe('all')
  })
})
