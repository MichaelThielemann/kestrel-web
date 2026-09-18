import { describe, expect, it } from 'vitest'
import { sanitizeInBrowser } from './useSanitizedHtml'

describe('sanitizeInBrowser', () => {
  it('removes script tags and their content', async () => {
    expect(await sanitizeInBrowser('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>')
  })

  it('removes inline event handler attributes', async () => {
    expect(await sanitizeInBrowser('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>')
  })

  it('removes javascript: links', async () => {
    expect(await sanitizeInBrowser('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>')
  })

  it('removes iframes', async () => {
    expect(await sanitizeInBrowser('<p>hi</p><iframe src="https://evil.example"></iframe>')).toBe('<p>hi</p>')
  })

  it('keeps allowed links, headings, lists, and bold/italic formatting', async () => {
    const html = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p><ul><li>one</li><li>two</li></ul><a href="https://example.com">link</a>'
    expect(await sanitizeInBrowser(html)).toBe(html)
  })

  it('throws when DOMPurify reports it is not supported in this environment', async () => {
    const { default: DOMPurify } = await import('dompurify')
    const wasSupported = DOMPurify.isSupported
    DOMPurify.isSupported = false
    try {
      await expect(sanitizeInBrowser('<p>hi</p>')).rejects.toThrow()
    } finally {
      DOMPurify.isSupported = wasSupported
    }
  })
})
