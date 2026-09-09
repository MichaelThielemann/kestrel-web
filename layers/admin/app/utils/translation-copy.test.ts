import { describe, expect, it } from 'vitest'
import type { SerializedField } from '#kestrel-admin/types/kestrel'
import { translationSourceValues } from './translation-copy'

describe('translationSourceValues', () => {
  it('picks only the localized fields present in the source', () => {
    const fields: Record<string, SerializedField> = {
      title: { type: 'text', required: true, unique: false, localized: true },
      status: { type: 'choice', required: true, unique: false, localized: false },
      body: { type: 'json', required: false, unique: false, localized: true },
    }
    const source = { title: 'Über uns', status: 'draft', body: [{ id: 'b1', type: 'hero', props: {} }] }

    expect(translationSourceValues(fields, source)).toEqual({
      title: 'Über uns',
      body: [{ id: 'b1', type: 'hero', props: {} }],
    })
  })

  it('skips a localized field the source document does not carry', () => {
    const fields: Record<string, SerializedField> = {
      title: { type: 'text', required: true, unique: false, localized: true },
      description: { type: 'text', required: false, unique: false, localized: true },
    }
    const source = { title: 'Über uns' }

    expect(translationSourceValues(fields, source)).toEqual({ title: 'Über uns' })
  })

  it('leaves media and link reference values untouched', () => {
    const fields: Record<string, SerializedField> = {
      image: { type: 'media', required: false, unique: false, localized: true },
      link: { type: 'link', required: false, unique: false, localized: true },
    }
    const source = {
      image: { id: 'm1', path: '/media/m1.jpg' },
      link: { type: 'internal', collection: 'pages', id: 'p2', path: '/about' },
    }

    expect(translationSourceValues(fields, source)).toEqual(source)
  })

  it('converts a slug field from wire format, same as loading a record does', () => {
    const fields: Record<string, SerializedField> = {
      slug: { type: 'slug', required: true, unique: true, localized: true },
    }

    expect(translationSourceValues(fields, { slug: 'home' })).toEqual({ slug: '' })
    expect(translationSourceValues(fields, { slug: 'about-us' })).toEqual({ slug: 'about-us' })
  })

  it('keeps block ids as they are', () => {
    const fields: Record<string, SerializedField> = {
      body: { type: 'json', required: false, unique: false, localized: true },
    }
    const blocks = [{ id: 'b1', type: 'hero', props: { heading: 'Willkommen' }, slots: { items: [{ id: 'b2', type: 'card', props: {} }] } }]

    expect(translationSourceValues(fields, { body: blocks })).toEqual({ body: blocks })
  })

  it('returns nothing when no field is localized', () => {
    const fields: Record<string, SerializedField> = {
      status: { type: 'choice', required: true, unique: false, localized: false },
    }

    expect(translationSourceValues(fields, { status: 'draft' })).toEqual({})
  })
})
