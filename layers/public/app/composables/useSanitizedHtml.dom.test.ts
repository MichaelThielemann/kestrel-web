import { describe, expect, it } from 'vitest'
import { cachedSanitizedHtml, sanitizeInBrowser } from './useSanitizedHtml'

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

  it.each(['__NUXT_DATA__', '__nuxt', 'teleports', 'nuxt-loading', 'site-main', '_x', '1-intro'])('drops the id %j and keeps the element', async (id) => {
    expect(await sanitizeInBrowser(`<div id="${id}">Text</div>`)).toBe('<div>Text</div>')
  })

  it('keeps a letter-led anchor id', async () => {
    expect(await sanitizeInBrowser('<h2 id="team-2026">Team</h2>')).toBe('<h2 id="team-2026">Team</h2>')
  })
})

describe('cachedSanitizedHtml', () => {
  const app = (value: unknown) => ({ isHydrating: true, payload: { data: { k: value } }, static: { data: {} } })

  it('sanitizes a cached value again before the browser renders it', () => {
    expect(cachedSanitizedHtml('k', app('<p>ok</p><img src="x" onerror="alert(1)">'), { cause: 'initial' })).toBe('<p>ok</p><img src="x">')
  })

  it('returns a clean cached value unchanged, so hydration sees the server markup', () => {
    const clean = '<p>Line<br />two &amp; more</p>'
    expect(cachedSanitizedHtml('k', app(clean), { cause: 'initial' })).toBe(clean)
  })

  it('passes a missing value through', () => {
    expect(cachedSanitizedHtml('k', app(undefined), { cause: 'initial' })).toBeUndefined()
  })
})

