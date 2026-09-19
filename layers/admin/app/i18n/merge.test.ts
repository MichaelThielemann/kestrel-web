import { describe, it, expect, vi } from 'vitest'
import { en } from './en'
import { de } from './de'
import { mergeAdminI18n } from './merge'

vi.mock('#kestrel/consumer-admin-i18n', () => ({
  default: {
    en: { 'common.save': 'Store' },
    fr: { 'common.save': 'Enregistrer' },
  },
}))

const { adminCatalogs, adminLangs } = await import('./catalogs')
const { translate } = await import('../composables/useT')

describe('mergeAdminI18n', () => {
  it('keeps the shipped catalogs when nothing is overridden', () => {
    const merged = mergeAdminI18n({})
    expect(merged.langs).toEqual(['en', 'de'])
    expect(merged.catalogs.en).toEqual(en)
    expect(merged.catalogs.de).toEqual(de)
    expect(merged.unknownKeys).toEqual({})
  })

  it('overrides single keys and leaves the rest alone', () => {
    const merged = mergeAdminI18n({ de: { 'common.save': 'Sichern' } })
    expect(merged.catalogs.de?.['common.save']).toBe('Sichern')
    expect(merged.catalogs.de?.['common.cancel']).toBe(de['common.cancel'])
    expect(de['common.save']).not.toBe('Sichern')
  })

  it('appends an additional language with only the strings it brings', () => {
    const merged = mergeAdminI18n({ fr: { 'common.save': 'Enregistrer' } })
    expect(merged.langs).toEqual(['en', 'de', 'fr'])
    expect(merged.catalogs.fr).toEqual({ 'common.save': 'Enregistrer' })
  })

  it('reports keys that no catalog defines', () => {
    const overrides: Record<string, Record<string, string>> = { fr: { 'common.save': 'Enregistrer', 'common.notAKey': 'x' } }
    expect(mergeAdminI18n(overrides).unknownKeys).toEqual({ fr: ['common.notAKey'] })
  })
})

describe('the merged catalogs', () => {
  it('lists the additional language for the switcher', () => {
    expect(adminLangs).toEqual(['en', 'de', 'fr'])
  })

  it('serves the consumer override instead of the shipped string', () => {
    expect(translate(adminCatalogs.en ?? {}, en, 'common.save')).toBe('Store')
  })

  it('falls back to English key by key in an additional language', () => {
    expect(translate(adminCatalogs.fr ?? {}, en, 'common.save')).toBe('Enregistrer')
    expect(translate(adminCatalogs.fr ?? {}, en, 'common.cancel')).toBe(en['common.cancel'])
  })
})
