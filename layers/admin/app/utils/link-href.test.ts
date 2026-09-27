import { describe, expect, it } from 'vitest'
import { linkHref } from './link-href'

describe('linkHref', () => {
  it('gives no href for an external target outside http(s), mailto, tel and site-relative paths', () => {
    expect(linkHref({ type: 'external', url: 'javascript:alert(1)' })).toBeNull()
    expect(linkHref({ type: 'external', url: 'data:text/html,x' })).toBeNull()
  })

  it('keeps allowed external targets and builds the others', () => {
    expect(linkHref({ type: 'external', url: 'https://example.com' })).toBe('https://example.com')
    expect(linkHref({ type: 'internal', collection: 'pages', id: '1' })).toBe('/admin/pages/1')
    expect(linkHref({ type: 'email', email: 'a@example.com' })).toBe('mailto:a@example.com')
  })
})
