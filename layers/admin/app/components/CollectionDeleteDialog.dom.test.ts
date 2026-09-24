import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, onTestFinished } from 'vitest'
import { en } from '#kestrel-admin/i18n/en'
import type { BatchDeleteReport } from '../utils/collection-ops'
import CollectionDeleteDialog from './CollectionDeleteDialog.vue'

function reportOf(overrides: Partial<BatchDeleteReport>): BatchDeleteReport {
  return { count: 1, referencedCount: 0, referenced: [], references: [], checked: true, verifiable: true, ...overrides }
}

describe('CollectionDeleteDialog', () => {
  it('warns about unverified references only when the collection has a referrers route', async () => {
    const wrapper = await mountSuspended(CollectionDeleteDialog, {
      props: { open: true, report: reportOf({ checked: false, verifiable: true }) },
      attachTo: document.body,
    })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).toContain(en['list.deleteRefsUnverified'])
  })

  it('skips the reference check for a collection without a referrers route', async () => {
    const wrapper = await mountSuspended(CollectionDeleteDialog, {
      props: { open: true, report: reportOf({ checked: false, verifiable: false }) },
      attachTo: document.body,
    })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).not.toContain(en['list.deleteRefsUnverified'])
  })

  it('reports unverified references when the referrers route fails', async () => {
    const wrapper = await mountSuspended(CollectionDeleteDialog, {
      props: { open: true, report: reportOf({ checked: false, verifiable: true }) },
      attachTo: document.body,
    })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).toContain(en['list.deleteRefsUnverified'])
  })

  it('shows no warning once the references were checked', async () => {
    const wrapper = await mountSuspended(CollectionDeleteDialog, {
      props: { open: true, report: reportOf({ checked: true, verifiable: true }) },
      attachTo: document.body,
    })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).not.toContain(en['list.deleteRefsUnverified'])
  })

  it('keeps the translation-only delete option when the whole record cannot be deleted', async () => {
    const wrapper = await mountSuspended(CollectionDeleteDialog, {
      props: {
        open: true,
        report: reportOf({}),
        translation: { locale: 'en', others: ['de'], defaultLocale: 'en' },
        canDeleteAll: false,
      },
      attachTo: document.body,
    })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).toContain(en['list.deleteTranslationOnly'].replace('{locale}', 'EN'))
    expect(document.body.textContent).not.toContain(en['list.deleteAllLocales'].replace('{locales}', 'EN, DE'))
  })

  it('still offers deleting all locales when the whole record can be deleted', async () => {
    const wrapper = await mountSuspended(CollectionDeleteDialog, {
      props: {
        open: true,
        report: reportOf({}),
        translation: { locale: 'en', others: ['de'], defaultLocale: 'en' },
        canDeleteAll: true,
      },
      attachTo: document.body,
    })
    onTestFinished(() => wrapper.unmount())

    expect(document.body.textContent).toContain(en['list.deleteTranslationOnly'].replace('{locale}', 'EN'))
    expect(document.body.textContent).toContain(en['list.deleteAllLocales'].replace('{locales}', 'EN, DE'))
  })
})
