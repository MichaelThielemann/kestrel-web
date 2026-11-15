import { describe, expect, it } from 'vitest'
import { de } from '../i18n/de'
import { en } from '../i18n/en'
import type { Catalog } from '../i18n/define'
import type { ApiErrorDetails } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { redirectRuleError, redirectRuleDetails } from './redirect-rule-errors'

const FROM = ['blank', 'too-long', 'scheme-or-host', 'query-or-fragment', 'control-characters', 'backslash', 'dot-segments', 'adjacent-double-wildcards', 'too-many-wildcards', 'reserved-path']
const TO = ['blank', 'control-characters', 'backslash', 'protocol-relative', 'unsupported-scheme', 'invalid-url', 'embedded-credentials', 'placeholder-in-host', 'placeholder-out-of-range', 'placeholder-syntax', 'automatic-redirect-loop']
const RULES = [
  ...FROM.map((reason) => ({ field: 'from', reason })),
  ...TO.map((reason) => ({ field: 'to', reason })),
  { field: 'status', reason: 'invalid-status' },
]
const WHOLE = ['not-a-list', 'too-many-rules']

const interpolate = (template: string, params?: Record<string, unknown>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (params?.[k] != null ? String(params[k]) : m))
const translator = (catalog: Catalog) => (key: string, params?: Record<string, unknown>) => interpolate(catalog[key] ?? key, params)
const wire = (value: object) => boundaryCast<ApiErrorDetails>(value, 'json')
const tEn = translator(en)
const tDe = translator(de)

describe('redirectRuleError', () => {
  it.each(RULES)('words $field $reason in both admin languages', ({ field, reason }) => {
    const details = { row: 3, field, reason, path: '/admin' }
    const english = redirectRuleError(tEn, wire(details))
    const german = redirectRuleError(tDe, wire(details))
    expect(english).toMatchObject({ row: 3, field })
    expect(german).toMatchObject({ row: 3, field })
    for (const text of [english?.text, german?.text]) {
      expect(text).toBeTruthy()
      expect(text).not.toMatch(/\{path\}|^redirects\./)
    }
    expect(german?.text).not.toBe(english?.text)
  })

  it.each(WHOLE)('words the rejected list %s without a row or a field', (reason) => {
    const english = redirectRuleError(tEn, wire({ reason }))
    const german = redirectRuleError(tDe, wire({ reason }))
    expect(Object.keys(english ?? {})).toEqual(['text'])
    expect(Object.keys(german ?? {})).toEqual(['text'])
    expect(german?.text).not.toBe(english?.text)
    expect(english?.text).not.toMatch(/^redirects\./)
  })

  it('fills the reserved prefix into the text', () => {
    const details = { row: 1, field: 'from', reason: 'reserved-path', path: '/admin' }
    expect(redirectRuleError(tDe, wire(details))?.text).toContain('/admin')
    expect(redirectRuleError(tEn, wire(details))?.text).toContain('/admin')
  })

  it('fills the target of an automatic redirect into the text', () => {
    const details = { row: 1, field: 'to', reason: 'automatic-redirect-loop', path: '/old-team' }
    expect(redirectRuleError(tDe, wire(details))?.text).toContain('/old-team')
    expect(redirectRuleError(tEn, wire(details))?.text).toContain('/old-team')
  })

  it('calls a rule that points at an automatically redirected address a chain, not a loop', () => {
    const details = { row: 1, field: 'to', reason: 'automatic-redirect-loop', path: '/old-team' }
    expect(redirectRuleError(tDe, wire(details))?.text).toMatch(/Kette/)
    expect(redirectRuleError(tDe, wire(details))?.text).not.toMatch(/Schleife/)
    expect(redirectRuleError(tEn, wire(details))?.text).toMatch(/chain/)
    expect(redirectRuleError(tEn, wire(details))?.text).not.toMatch(/loop/)
  })

  it('words a reason that names a path without one, leaving no placeholder', () => {
    for (const details of [{ row: 1, field: 'from', reason: 'reserved-path' }, { row: 1, field: 'to', reason: 'automatic-redirect-loop' }]) {
      for (const t of [tEn, tDe]) {
        const text = redirectRuleError(t, wire(details))?.text
        expect(text).toBeTruthy()
        expect(text).not.toMatch(/\{path\}|^redirects\./)
      }
    }
  })

  it('answers null for a reason it does not know', () => {
    expect(redirectRuleError(tDe, wire({ row: 1, field: 'from', reason: 'something-new' }))).toBeNull()
  })

  it('answers null when the reason belongs to another field', () => {
    expect(redirectRuleError(tDe, wire({ row: 1, field: 'status', reason: 'blank' }))).toBeNull()
    expect(redirectRuleError(tDe, wire({ row: 1, field: 'from', reason: 'invalid-status' }))).toBeNull()
  })

  it('answers null without a reason or without details', () => {
    expect(redirectRuleError(tDe, undefined)).toBeNull()
    expect(redirectRuleError(tDe, wire({}))).toBeNull()
    expect(redirectRuleError(tDe, wire({ problems: [{ path: '$.rules', message: 'is not an array' }] }))).toBeNull()
    expect(redirectRuleError(tDe, wire({ row: 2, field: 'from' }))).toBeNull()
  })

  it('answers null for a reason that is not a string', () => {
    expect(redirectRuleError(tDe, wire({ row: 1, field: 'from', reason: 4 }))).toBeNull()
  })

  it('leaves out a row that is not a positive integer', () => {
    for (const row of [0, '2', -1, 1.5]) {
      const error = redirectRuleError(tDe, wire({ row, field: 'from', reason: 'blank' }))
      expect(error?.field).toBe('from')
      expect(error?.row).toBeUndefined()
    }
  })

  it('answers null for a field the editor does not have', () => {
    expect(redirectRuleError(tDe, wire({ row: 1, field: 'method', reason: 'blank' }))).toBeNull()
  })

  it('keeps wildcards and placeholders apart in the German texts', () => {
    const german: Catalog = de
    expect(german['redirects.reason.from.tooManyWildcards']).toMatch(/Wildcards/)
    expect(german['redirects.reason.from.tooManyWildcards']).not.toMatch(/Platzhalter/)
    expect(german['redirects.reason.to.placeholderOutOfRange']).toMatch(/Platzhalter/)
    expect(german['redirects.reason.to.placeholderOutOfRange']).toMatch(/Wildcard/)
    expect(german['redirects.reason.to.placeholderOutOfRange']).not.toMatch(/Platzhalter.*Platzhalter/)
  })

  it('covers every reason of the server in both catalogs', () => {
    const keys = Object.keys(en).filter((key) => key.startsWith('redirects.reason.'))
    expect(keys.length).toBeGreaterThanOrEqual(RULES.length + WHOLE.length)
    const german: Catalog = de
    for (const key of keys) expect(german[key]).toBeTruthy()
  })
})

describe('redirectRuleDetails', () => {
  it('takes the structured details of a rejected rule', () => {
    expect(redirectRuleDetails(wire({ row: 2, field: 'to', reason: 'invalid-url', path: '/x' }))).toEqual({ row: 2, field: 'to', reason: 'invalid-url', path: '/x' })
  })
  it('drops what is not of the documented shape', () => {
    expect(redirectRuleDetails(wire({ row: 'x', field: 7, reason: 'blank', path: 3 }))).toEqual({ reason: 'blank' })
  })
  it('answers null without a reason', () => {
    expect(redirectRuleDetails(undefined)).toBeNull()
    expect(redirectRuleDetails(wire({ row: 1 }))).toBeNull()
  })
})
