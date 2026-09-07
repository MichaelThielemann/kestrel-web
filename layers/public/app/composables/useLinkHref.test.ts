import { describe, it, expect } from 'vitest'
import { linkHrefOf } from './useLinkHref'

describe('linkHrefOf', () => {
  it('returns the resolved path with optional hash', () => {
    expect(linkHrefOf({ type: 'internal', path: '/about' })).toBe('/about')
    expect(linkHrefOf({ type: 'internal', path: '/about', hash: 'team' })).toBe('/about#team')
  })

  it('returns # for an internal link that is not resolved yet', () => {
    expect(linkHrefOf({ type: 'internal' })).toBe('#')
  })

  it('returns null for a broken internal link', () => {
    expect(linkHrefOf({ type: 'internal', broken: true })).toBeNull()
    expect(linkHrefOf({ type: 'internal', broken: true, path: '/draft' })).toBeNull()
  })

  it('passes external, email and tel through', () => {
    expect(linkHrefOf({ type: 'external', url: 'https://x.de' })).toBe('https://x.de')
    expect(linkHrefOf({ type: 'email', email: 'a@b.de' })).toBe('mailto:a@b.de')
    expect(linkHrefOf({ type: 'tel', tel: '+49 1' })).toBe('tel:+49 1')
    expect(linkHrefOf(null)).toBeNull()
  })
})
