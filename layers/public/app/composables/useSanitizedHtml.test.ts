import { describe, it, expect } from 'vitest'
import { sanitizeOnServer } from './useSanitizedHtml'

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

  it.each(['__NUXT_DATA__', '__nuxt', 'teleports', 'Teleports', 'nuxt-loading', 'site-main', '_x', '1-intro', 'a b'])('drops the id %j and keeps the element', async (id) => {
    expect(await sanitizeOnServer(`<div id="${id}">Text</div>`)).toBe('<div>Text</div>')
  })

  it('keeps a letter-led anchor id', async () => {
    expect(await sanitizeOnServer('<h2 id="team-2026">Team</h2>')).toBe('<h2 id="team-2026">Team</h2>')
  })
})

describe('the id rule next to the backend sanitizer', () => {
  it('drops every id the backend drops', async () => {
    const { createValidator } = await import('@michaelthielemann/kestrel-validate-jsonschema/impl')
    const { silentLogger } = await import('@michaelthielemann/kestrel/logger')
    const validator = await createValidator({ schemas: { 'x.html': { type: 'string', format: 'html' } }, maxDepth: 8, maxNodes: 100 }, process.cwd(), silentLogger)
    try {
      for (const id of ['__NUXT_DATA__', '__nuxt', '_x', '1-intro', 'a b', 'a:b', 'ü', `a${'b'.repeat(64)}`, 'team', 'Team_2']) {
        const html = `<p id="${id}">x</p>`
        const backendKeeps = String(validator.sanitize('x.html', html)).includes('id=')
        const layerKeeps = (await sanitizeOnServer(html)).includes('id=')
        if (!backendKeeps) expect(layerKeeps, id).toBe(false)
      }
    } finally {
      validator.close()
    }
  })
})

