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

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', '\u0000javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<p>x</p>', 'vbscript:msgbox(1)'])('gives no href for the stored external target %j', (url) => {
    expect(linkHrefOf({ type: 'external', url })).toBeNull()
  })

  it('keeps http(s), mailto, tel and site-relative external targets', () => {
    expect(linkHrefOf({ type: 'external', url: 'HTTPS://x.de' })).toBe('HTTPS://x.de')
    expect(linkHrefOf({ type: 'external', url: 'mailto:a@b.de' })).toBe('mailto:a@b.de')
    expect(linkHrefOf({ type: 'external', url: 'tel:+491' })).toBe('tel:+491')
    expect(linkHrefOf({ type: 'external', url: '/kontakt' })).toBe('/kontakt')
    expect(linkHrefOf({ type: 'external', url: '#top' })).toBe('#top')
  })

  it('gives no href for an internal link whose path is not a site path', () => {
    expect(linkHrefOf({ type: 'internal', path: 'javascript:alert(1)' })).toBeNull()
  })
})
