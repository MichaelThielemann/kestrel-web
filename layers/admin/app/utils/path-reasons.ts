import type { Translate } from '../actions/types'

const LOCALE_CODE = /^"(.+)" is a locale code and cannot start a path$/
const RESERVED = /^the path (\S+) lies under the reserved path (\S+)$/
const PARENT_WITHOUT_SLUG = 'a page above has no slug in this locale'
const TAKEN = /^taken by \S+ ".*"$/

/** The admin-language sentence for the reason `site-default`'s path preview gives why a path is not served; a reason it does not know reads as an invalid path. */
export function pathReasonText(t: Translate, reason: string): string {
  const slug = LOCALE_CODE.exec(reason)?.[1]
  if (slug !== undefined) return t('field.slug.reason.locale', { slug })
  const reserved = RESERVED.exec(reason)
  if (reserved?.[1] !== undefined && reserved[2] !== undefined) return t('field.slug.reason.reserved', { path: reserved[1], reserved: reserved[2] })
  if (reason === PARENT_WITHOUT_SLUG) return t('field.slug.reason.parentWithoutSlug')
  if (TAKEN.test(reason)) return t('field.slug.reason.taken')
  return t('field.slug.reason.invalid')
}
