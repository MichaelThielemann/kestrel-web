import { describe, it, expect, vi } from 'vitest'

vi.mock('./collections', () => ({ findCollection: (name: string) => (name === 'pages' ? { fields: { title: { type: 'text' }, slug: { type: 'slug' } } } : undefined) }))

const { referrerLabel, referrerPath, referrerKey } = await import('./referrer-label')

describe('referrer labels', () => {
  const ref = { type: 'pages', id: 'p1', field: 'body' }

  it('uses the record title when the document is known', () => {
    expect(referrerLabel(ref, { title: 'Startseite' })).toBe('Startseite')
  })

  it('falls back to type/id without a document or title', () => {
    expect(referrerLabel(ref, null)).toBe('pages/p1')
    expect(referrerLabel({ type: 'news', id: 'n1', field: 'body' }, { title: 'x' })).toBe('news/n1')
  })

  it('links to the record of its own collection', () => {
    expect(referrerPath({ type: 'news', id: 'n1', field: 'body' })).toBe('/admin/news/n1')
    expect(referrerKey(ref)).toBe('pages/p1')
  })
})
