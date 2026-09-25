import { describe, expect, it } from 'vitest'
import { buildPreviewDocument, previewPageDocument } from './preview-channel'

const BASE = { id: 'p1', slug: 'about', title: 'About', body: [], seo: null, layout: null }

describe('buildPreviewDocument', () => {
  it('carries the base document fields through unchanged', () => {
    const document = buildPreviewDocument(BASE, [], {})
    expect(document).toEqual(BASE)
  })

  it('merges every named model field from the current form values', () => {
    const values = { ctaLabel: 'Book now', ctaLink: { type: 'external', url: 'https://example.test' }, unrelated: 'ignored' }
    const document = buildPreviewDocument(BASE, ['ctaLabel', 'ctaLink'], values)
    expect(document.ctaLabel).toBe('Book now')
    expect(document.ctaLink).toEqual({ type: 'external', url: 'https://example.test' })
    expect(document).not.toHaveProperty('unrelated')
  })

  it('carries an unset field through as undefined rather than skipping it', () => {
    const document = buildPreviewDocument(BASE, ['ctaLabel'], {})
    expect(document).toHaveProperty('ctaLabel', undefined)
  })
})

describe('previewPageDocument', () => {
  it('fixes status and shareImage to null and invents no timestamps', () => {
    const document = buildPreviewDocument(BASE, ['ctaLabel'], { ctaLabel: 'Book now' })
    const page = previewPageDocument(document)
    expect(page).toEqual({ ...BASE, ctaLabel: 'Book now', status: null, shareImage: null })
  })
})
