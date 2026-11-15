import { describe, expect, it } from 'vitest'
import { pathReasonText } from './path-reasons'

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)

describe('pathReasonText', () => {
  it('names a path that starts with a language code', () => {
    expect(pathReasonText(t, '"en" is a locale code and cannot start a path')).toBe(t('field.slug.reason.locale', { slug: 'en' }))
  })

  it('names a path under a path the system uses', () => {
    expect(pathReasonText(t, 'the path /admin/team lies under the reserved path /admin')).toBe(t('field.slug.reason.reserved', { path: '/admin/team', reserved: '/admin' }))
  })

  it('names a parent page without a slug in the language', () => {
    expect(pathReasonText(t, 'a page above has no slug in this locale')).toBe('field.slug.reason.parentWithoutSlug')
  })

  it('names a path another document holds', () => {
    expect(pathReasonText(t, 'taken by pages "Our team"')).toBe('field.slug.reason.taken')
  })

  it('names an invalid path without repeating the server text', () => {
    expect(pathReasonText(t, 'the slug "a b" is not a valid path segment')).toBe('field.slug.reason.invalid')
  })
})
