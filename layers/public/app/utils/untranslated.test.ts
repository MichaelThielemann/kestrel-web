import { describe, expect, it } from 'vitest'
import { isFallbackDocument, primaryPathOf } from './untranslated'
import type { PageDocument } from '#kestrel-core/app/types/api'

function doc(over: Partial<PageDocument> = {}): PageDocument {
  return {
    id: 'p1',
    createdAt: 0,
    updatedAt: 0,
    slug: 'about',
    title: 'About',
    body: [],
    seo: null,
    status: 'published',
    shareImage: null,
    layout: null,
    _locales: { title: 'en', body: 'en', seo: 'en', slug: 'en' },
    _translations: { en: true },
    ...over,
  }
}

describe('isFallbackDocument', () => {
  it('is not a fallback when every localized field is owned by the requested locale', () => {
    expect(isFallbackDocument(doc(), 'en')).toBe(false)
  })

  it('scans _locales when the backend sends no _translations', () => {
    const d = doc({ _translations: undefined, _locales: { title: 'en', body: 'de', seo: 'en', slug: 'en' } })
    expect(isFallbackDocument(d, 'en')).toBe(true)
  })

  it('treats a missing _locales map as not a fallback', () => {
    const d = doc({ _locales: undefined })
    expect(isFallbackDocument(d, 'en')).toBe(false)
  })

  it('lets _translations decide when the backend provides it', () => {
    const complete = doc({ _translations: { de: true, en: true }, _locales: { title: 'en', seo: 'de' } })
    expect(isFallbackDocument(complete, 'en')).toBe(false)
    const missing = doc({ _translations: { de: true, en: false }, _locales: { title: 'en' } })
    expect(isFallbackDocument(missing, 'en')).toBe(true)
  })
})

describe('primaryPathOf', () => {
  it('builds the primary-locale path for a normal slug', () => {
    const d = doc({ slug: 'about' })
    expect(primaryPathOf(d, 'de', false, 'home')).toBe('/about')
  })

  it('builds the primary-locale root path for the home slug', () => {
    const d = doc({ slug: 'home' })
    expect(primaryPathOf(d, 'de', false, 'home')).toBe('/')
  })

  it('prefixes the primary locale when prefixPrimary is true', () => {
    const d = doc({ slug: 'about' })
    expect(primaryPathOf(d, 'de', true, 'home')).toBe('/de/about')
  })
})
