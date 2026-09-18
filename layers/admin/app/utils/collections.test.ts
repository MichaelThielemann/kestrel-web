import { describe, it, expect, vi } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { serializeCollections } from '#kestrel/collections-ui'

vi.mock('#kestrel/consumer-block-tags', () => ({
  default: {
    hero: { en: 'Hero', de: 'Hero-Bereich' },
    cta: 'Call to action',
  },
}))

const { findCollection, editorOwnedFields, blockTagLabel, contentLocales, collections } = await import('./collections')

const contentTypes = {
  pages: {
    kind: 'multi' as const,
    fields: {
      slug: { type: 'slug', required: true },
      title: { type: 'text', required: true },
      status: { type: 'enum', options: ['draft', 'finished', 'published'] },
      layout: { type: 'text' },
    },
  },
  authors: {
    kind: 'multi' as const,
    fields: {
      name: { type: 'text' },
    },
  },
}

const collectionsUi = {
  pages: { label: { singular: 'Page', plural: 'Pages' }, editorOwned: ['title'] },
  authors: { label: { singular: 'Author', plural: 'Authors' }, editorOwned: ['name'] },
}

const schema: AdminSchema = {
  locales: { all: ['en', 'de'], primary: 'en', prefixPrimary: false },
  collections: serializeCollections(contentTypes, collectionsUi),
  features: [],
  capabilities: { pipelines: [] },
}

describe('collections', () => {
  it('passes the schema collections through unchanged', () => {
    expect(collections(schema).map((c) => c.name)).toEqual(['pages', 'authors'])
  })

  it('answers with an empty list while the schema is unloaded', () => {
    expect(collections(null)).toEqual([])
  })
})

describe('findCollection', () => {
  it('finds a serialized collection by name', () => {
    expect(findCollection(schema, 'pages')?.name).toBe('pages')
    expect(findCollection(schema, 'authors')?.name).toBe('authors')
  })

  it('returns undefined for an unknown collection', () => {
    expect(findCollection(schema, 'nope')).toBeUndefined()
  })

  it('returns undefined while the schema is unloaded', () => {
    expect(findCollection(null, 'pages')).toBeUndefined()
  })
})

describe('editorOwnedFields', () => {
  it('appends the layout field when the collection has a layoutField', () => {
    expect(editorOwnedFields(schema, 'pages')).toEqual(['title', 'layout'])
  })

  it('returns the UI-declared owned fields unchanged when there is no layout field', () => {
    expect(editorOwnedFields(schema, 'authors')).toEqual(['name'])
  })

  it('returns an empty array for an unknown collection', () => {
    expect(editorOwnedFields(schema, 'nope')).toEqual([])
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
  it('passes the schema locales through unchanged', () => {
    expect(contentLocales(schema)).toEqual({ locales: ['en', 'de'], primary: 'en', prefixPrimary: false })
  })

  it('answers with empty locales while the schema is unloaded', () => {
    expect(contentLocales(null)).toEqual({ locales: [], primary: '', prefixPrimary: false })
  })
})
