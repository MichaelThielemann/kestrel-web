import { describe, it, expect } from 'vitest'
import { pickLang, langLabel } from './lang'

describe('pickLang', () => {
  it('takes the first exact match', () => {
    expect(pickLang(['en', 'de', 'fr'], ['fr', 'de'])).toBe('fr')
  })

  it('matches a regional tag against its base language', () => {
    expect(pickLang(['en', 'de'], ['de-AT', 'en-US'])).toBe('de')
  })

  it('ignores case', () => {
    expect(pickLang(['en', 'de'], ['DE'])).toBe('de')
  })

  it('skips languages that have no catalog', () => {
    expect(pickLang(['en', 'de'], ['es', 'it', 'de'])).toBe('de')
  })

  it('falls back to the first available language', () => {
    expect(pickLang(['en', 'de'], ['es'])).toBe('en')
    expect(pickLang([], [])).toBe('en')
  })
})

describe('langLabel', () => {
  it('names a language in its own language', () => {
    expect(langLabel('de')).toBe('Deutsch')
    expect(langLabel('en')).toBe('English')
  })

  it('falls back to the tag itself', () => {
    expect(langLabel('zz')).toBe('ZZ')
  })
})
