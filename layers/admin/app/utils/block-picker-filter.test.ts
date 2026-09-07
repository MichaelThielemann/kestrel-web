import { describe, expect, it } from 'vitest'
import { collectBlockTags, filterBlockTypes, normalizeForSearch } from './block-picker-filter'
import type { SerializedBlock } from '#kestrel/types/kestrel'

const hero: SerializedBlock = { name: 'hero', label: { en: 'Hero', de: 'Held' }, description: { en: 'A big banner', de: 'Ein Banner für die Startseite' }, tags: ['hero', 'marketing'], fields: {} }
const uberHero: SerializedBlock = { name: 'ueber-uns', label: { en: 'About us', de: 'Über uns' }, tags: ['marketing'], fields: {} }
const columns: SerializedBlock = { name: 'boxed-container', label: 'Boxed container', tags: ['layout'], fields: {} }
const untagged: SerializedBlock = { name: 'prose', label: 'Prose', fields: {} }

const types = [hero, uberHero, columns, untagged]

describe('normalizeForSearch', () => {
  it('lowercases, trims and strips diacritics', () => {
    expect(normalizeForSearch('  Über UNS  ')).toBe('uber uns')
  })
})

describe('filterBlockTypes', () => {
  it('returns every type when query and tags are empty', () => {
    expect(filterBlockTypes({ types, query: '', tags: [], lang: 'en' })).toEqual(types)
  })

  it('matches the localized label in the given language', () => {
    expect(filterBlockTypes({ types, query: 'held', tags: [], lang: 'de' })).toEqual([hero])
  })

  it('matches the block name', () => {
    expect(filterBlockTypes({ types, query: 'boxed', tags: [], lang: 'en' })).toEqual([columns])
  })

  it('is accent-insensitive against a localized label', () => {
    expect(filterBlockTypes({ types, query: 'uber', tags: [], lang: 'de' })).toEqual([uberHero])
  })

  it('matches the localized description accent-insensitively', () => {
    expect(filterBlockTypes({ types, query: 'fur die startseite', tags: [], lang: 'de' })).toEqual([hero])
  })

  it('does not match a description in another locale than the one resolved', () => {
    expect(filterBlockTypes({ types, query: 'big banner', tags: [], lang: 'de' })).toEqual([])
  })

  it('falls back to the block name when there is no localized label', () => {
    const plain: SerializedBlock = { name: 'quote', fields: {} }
    expect(filterBlockTypes({ types: [plain], query: 'quote', tags: [], lang: 'en' })).toEqual([plain])
  })

  it('AND-combines multiple selected tags', () => {
    expect(filterBlockTypes({ types, query: '', tags: ['hero', 'marketing'], lang: 'en' })).toEqual([hero])
  })

  it('excludes a type missing one of the selected tags', () => {
    expect(filterBlockTypes({ types, query: '', tags: ['hero', 'layout'], lang: 'en' })).toEqual([])
  })

  it('excludes untagged types once a tag filter is active', () => {
    expect(filterBlockTypes({ types, query: '', tags: ['marketing'], lang: 'en' })).toEqual([hero, uberHero])
  })

  it('combines a search query with a tag filter', () => {
    expect(filterBlockTypes({ types, query: 'about', tags: ['marketing'], lang: 'en' })).toEqual([uberHero])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterBlockTypes({ types, query: 'nonexistent', tags: [], lang: 'en' })).toEqual([])
  })
})

describe('collectBlockTags', () => {
  it('collects the deduplicated, sorted set of tags across types', () => {
    expect(collectBlockTags(types)).toEqual(['hero', 'layout', 'marketing'])
  })

  it('returns an empty array when no type declares tags', () => {
    expect(collectBlockTags([untagged])).toEqual([])
  })
})
