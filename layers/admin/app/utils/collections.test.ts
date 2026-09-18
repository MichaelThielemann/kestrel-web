import { describe, it, expect, vi } from 'vitest'

vi.mock('~~/shared/model', () => ({
  contentTypes: {
    pages: {
      kind: 'multi',
      fields: {
        slug: { type: 'slug', required: true },
        title: { type: 'text', required: true },
        status: { type: 'enum', options: ['draft', 'finished', 'published'] },
        layout: { type: 'text' },
      },
    },
    authors: {
      kind: 'multi',
      fields: {
        name: { type: 'text' },
      },
    },
  },
  locales: ['en', 'de'],
  defaultLocale: 'en',
  prefixPrimary: false,
}))

vi.mock('~~/shared/collections-ui', () => ({
  default: {
    pages: { label: { singular: 'Page', plural: 'Pages' }, editorOwned: ['title'] },
    authors: { label: { singular: 'Author', plural: 'Authors' }, editorOwned: ['name'] },
  },
}))

vi.mock('#kestrel/consumer-block-tags', () => ({
  default: {
    hero: { en: 'Hero', de: 'Hero-Bereich' },
    cta: 'Call to action',
  },
}))

const { findCollection, editorOwnedFields, blockTagLabel, contentLocales } = await import('./collections')

describe('findCollection', () => {
  it('finds a serialized collection by name', () => {
    expect(findCollection('pages')?.name).toBe('pages')
    expect(findCollection('authors')?.name).toBe('authors')
  })

  it('returns undefined for an unknown collection', () => {
    expect(findCollection('nope')).toBeUndefined()
  })
})

describe('editorOwnedFields', () => {
  it('appends the layout field when the collection has a layoutField', () => {
    expect(editorOwnedFields('pages')).toEqual(['title', 'layout'])
  })

  it('returns the UI-declared owned fields unchanged when there is no layout field', () => {
    expect(editorOwnedFields('authors')).toEqual(['name'])
  })

  it('returns an empty array for an unknown collection', () => {
    expect(editorOwnedFields('nope')).toEqual([])
  })
})

describe('blockTagLabel', () => {
  it('resolves a localized tag label for the given language', () => {
    expect(blockTagLabel('hero', 'de')).toBe('Hero-Bereich')
    expect(blockTagLabel('hero', 'en')).toBe('Hero')
  })

  it('returns a plain string tag as-is regardless of language', () => {
    expect(blockTagLabel('cta', 'de')).toBe('Call to action')
    expect(blockTagLabel('cta', 'en')).toBe('Call to action')
  })

  it('falls back to the tag name when it is not declared', () => {
    expect(blockTagLabel('unknown-tag', 'de')).toBe('unknown-tag')
  })
})

describe('contentLocales', () => {
  it('passes the model locales through unchanged', () => {
    expect(contentLocales).toEqual({ locales: ['en', 'de'], primary: 'en', prefixPrimary: false })
  })
})
