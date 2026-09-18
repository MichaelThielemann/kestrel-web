import { describe, expect, it } from 'vitest'
import type { SettingsDocument } from '#kestrel-core/app/types/api'
import { emptySiteSettings, metaDescription, toSiteSettings } from './site-settings'

function settings(extra: Partial<SettingsDocument> = {}): SettingsDocument {
  return { id: 'settings', createdAt: 0, updatedAt: 0, title: 'Kestrel', navigation: [], ...extra }
}

describe('toSiteSettings', () => {
  it('maps the localized site description', () => {
    expect(toSiteSettings(settings({ description: 'A small example site' })).description).toBe('A small example site')
  })

  it('answers an empty description when the field is missing or not a string', () => {
    expect(toSiteSettings(settings()).description).toBe('')
    expect(toSiteSettings(settings({ description: 42 })).description).toBe('')
    expect(toSiteSettings(settings({ description: null })).description).toBe('')
  })

  it('keeps title, separator, position and navigation', () => {
    const mapped = toSiteSettings(settings({
      title: 'Site',
      titleSeparator: ' | ',
      titlePosition: 'suffix',
      navigation: [{ label: 'Home', link: { type: 'internal', path: '/' } }],
    }))
    expect(mapped).toEqual({
      title: 'Site',
      description: '',
      titleSeparator: ' | ',
      titlePosition: 'suffix',
      navigation: [{ label: 'Home', link: { type: 'internal', path: '/' } }],
    })
  })

  it('has an empty description in the empty settings', () => {
    expect(emptySiteSettings().description).toBe('')
  })
})

describe('metaDescription', () => {
  it('prefers the page description', () => {
    expect(metaDescription('Page', 'Site')).toBe('Page')
  })

  it('falls back to the site description', () => {
    expect(metaDescription('', 'Site')).toBe('Site')
    expect(metaDescription('   ', 'Site')).toBe('Site')
    expect(metaDescription(undefined, 'Site')).toBe('Site')
    expect(metaDescription(null, 'Site')).toBe('Site')
  })

  it('answers an empty string when neither is set, so no meta tag is rendered', () => {
    expect(metaDescription('', '')).toBe('')
    expect(metaDescription(undefined, undefined)).toBe('')
    expect(metaDescription('  ', null)).toBe('')
  })
})
