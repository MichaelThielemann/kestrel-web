import { describe, it, expect } from 'vitest'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { referrerLabel, referrerPath, referrerKey } from './referrer-label'

const pageFields: Record<string, SerializedField> = {
  title: { type: 'text', required: false, unique: false, localized: false },
  slug: { type: 'slug', required: false, unique: false, localized: false },
}

describe('referrer labels', () => {
  const ref = { type: 'pages', id: 'p1', field: 'body' }

  it('uses the record title when the document is known', () => {
    expect(referrerLabel(ref, { title: 'Startseite' }, pageFields)).toBe('Startseite')
  })

  it('falls back to type/id without a document or title', () => {
    expect(referrerLabel(ref, null, pageFields)).toBe('pages/p1')
    expect(referrerLabel({ type: 'news', id: 'n1', field: 'body' }, { title: 'x' }, undefined)).toBe('news/n1')
  })

  it('links to the record of its own collection', () => {
    expect(referrerPath({ type: 'news', id: 'n1', field: 'body' })).toBe('/admin/news/n1')
    expect(referrerKey(ref)).toBe('pages/p1')
  })
})
