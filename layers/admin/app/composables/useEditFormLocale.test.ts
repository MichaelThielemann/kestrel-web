import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useEditFormLocale } from './useEditFormLocale'
import type { ActionDeps } from '../actions/types'
import type { Document } from '#kestrel-admin/types/api'

function documentWith(translations: Record<string, boolean>): Document {
  return { id: 'p1', createdAt: 0, updatedAt: 0, _translations: translations }
}

function deps(overrides: Partial<ActionDeps> = {}): ActionDeps {
  return {
    api: vi.fn(),
    t: (key: string) => key,
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    capabilities: {
      has: vi.fn(() => true),
      route: vi.fn(() => ({ method: 'GET' as const, path: '/pipeline' })),
      hasVerb: vi.fn(() => true),
      verbRoute: vi.fn(() => ({ method: 'GET' as const, path: '/articles/p1' })),
    },
    ...overrides,
  }
}

describe('useEditFormLocale', () => {
  it('reports the record as missing a translation once loaded translations say so', () => {
    const locale = ref('fr')
    const form = useEditFormLocale({
      deps: deps(),
      collection: 'articles',
      id: 'p1',
      mode: ref('multi'),
      translatable: ref(true),
      locale,
      primaryLocale: ref('en'),
      contentLocales: ref(['en', 'fr']),
    })

    form.setTranslations(documentWith({ en: true, fr: false }))

    expect(form.missingTranslation.value).toBe(true)
  })

  it('offers the primary locale as the copy source when it already has content', () => {
    const locale = ref('fr')
    const form = useEditFormLocale({
      deps: deps(),
      collection: 'articles',
      id: 'p1',
      mode: ref('multi'),
      translatable: ref(true),
      locale,
      primaryLocale: ref('en'),
      contentLocales: ref(['en', 'fr', 'de']),
    })

    form.setTranslations(documentWith({ en: true, fr: false, de: true }))

    expect(form.copySourceLocales.value).toEqual(['en', 'de'])
    expect(form.copySourceDefault.value).toBe('en')
  })

  it('hides the copy-translation prompt once a translation has been copied', () => {
    const locale = ref('fr')
    const form = useEditFormLocale({
      deps: deps(),
      collection: 'articles',
      id: 'p1',
      mode: ref('multi'),
      translatable: ref(true),
      locale,
      primaryLocale: ref('en'),
      contentLocales: ref(['en', 'fr']),
    })
    form.setTranslations(documentWith({ en: true, fr: false }))
    expect(form.showCopyTranslation.value).toBe(true)

    form.markCopied()

    expect(form.showCopyTranslation.value).toBe(false)
  })

  it('does not load a primary title for a new, untranslatable, or single-mode record', async () => {
    const api = vi.fn()
    const form = useEditFormLocale({
      deps: deps({ api }),
      collection: 'articles',
      id: 'new',
      mode: ref('multi'),
      translatable: ref(true),
      locale: ref('fr'),
      primaryLocale: ref('en'),
      contentLocales: ref(['en', 'fr']),
    })

    await form.loadPrimaryTitle()

    expect(api).not.toHaveBeenCalled()
    expect(form.primaryTitle.value).toBe('')
  })

  it('loads the primary-locale title for a translatable record shown in another locale', async () => {
    const api = vi.fn().mockResolvedValue({ title: 'Hello' })
    const form = useEditFormLocale({
      deps: deps({ api }),
      collection: 'articles',
      id: 'p1',
      mode: ref('multi'),
      translatable: ref(true),
      locale: ref('fr'),
      primaryLocale: ref('en'),
      contentLocales: ref(['en', 'fr']),
    })

    await form.loadPrimaryTitle()

    expect(form.primaryTitle.value).toBe('Hello')
  })
})
