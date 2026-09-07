import { describe, expect, it } from 'vitest'
import { hasExtras } from './useLinkField'

describe('hasExtras', () => {
  it('is false for a null value', () => {
    expect(hasExtras(null)).toBe(false)
  })

  it('is false for a bare external link', () => {
    expect(hasExtras({ type: 'external', url: 'https://example.com' })).toBe(false)
  })

  it('is true when a label is set', () => {
    expect(hasExtras({ type: 'external', url: 'https://example.com', label: 'Example' })).toBe(true)
  })

  it('is true when an internal link has a hash', () => {
    expect(hasExtras({ type: 'internal', collection: 'pages', id: '1', hash: 'top' })).toBe(true)
  })

  it('ignores hash on non-internal link shapes', () => {
    expect(hasExtras({ type: 'external', url: 'https://example.com' })).toBe(false)
  })
})
