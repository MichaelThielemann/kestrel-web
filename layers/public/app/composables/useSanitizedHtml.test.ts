import { describe, it, expect } from 'vitest'
import { sanitizeOnServer, sanitizedHtmlKey } from './useSanitizedHtml'

describe('sanitizeOnServer', () => {
  it('removes script tags and their content', async () => {
    expect(await sanitizeOnServer('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>')
  })

  it('removes inline event handler attributes', async () => {
    expect(await sanitizeOnServer('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>')
  })

  it('removes javascript: links', async () => {
    expect(await sanitizeOnServer('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>')
  })

  it('removes iframes', async () => {
    expect(await sanitizeOnServer('<p>hi</p><iframe src="https://evil.example"></iframe>')).toBe('<p>hi</p>')
  })

  it('keeps allowed links, headings, lists, and bold/italic formatting', async () => {
    const html = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p><ul><li>one</li><li>two</li></ul><a href="https://example.com">link</a>'
    expect(await sanitizeOnServer(html)).toBe(html)
  })
})

describe('sanitizedHtmlKey', () => {
  it('is the same for identical input regardless of how many other keys were computed first', () => {
    const before = sanitizedHtmlKey('<p>Hello</p>')
    sanitizedHtmlKey('<p>Unrelated one</p>')
    sanitizedHtmlKey('<p>Unrelated two</p>')
    const after = sanitizedHtmlKey('<p>Hello</p>')
    expect(after).toBe(before)
  })

  it('is stable across repeated calls with the same input', () => {
    expect(sanitizedHtmlKey('<p>Hello</p>')).toBe(sanitizedHtmlKey('<p>Hello</p>'))
  })

  it('differs for different input', () => {
    expect(sanitizedHtmlKey('<p>Hello</p>')).not.toBe(sanitizedHtmlKey('<p>Goodbye</p>'))
  })

  it('differs for two same-length inputs that collide under a 32-bit FNV-1a hash', () => {
    expect(sanitizedHtmlKey('9jsNIwfg')).not.toBe(sanitizedHtmlKey('uTyiFUWx'))
  })
})
