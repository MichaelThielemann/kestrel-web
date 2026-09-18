import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { defineCollectionsUi, serializeCollections, type ContentType } from '#kestrel/collections-ui'
import { useSchema } from '#kestrel-admin/composables/useSchema'
import { useCollections } from '#kestrel-admin/composables/useCollections'
import { useContentLocales } from '#kestrel-admin/composables/useContentLocales'
import { useFeatures } from '#kestrel-admin/composables/useFeatures'

const contentTypes: Record<string, ContentType> = {
  pages: {
    kind: 'multi',
    fields: {
      slug: { type: 'slug', required: true, localized: true },
      title: { type: 'text', required: true, localized: true },
      status: { type: 'enum', options: ['entwurf', 'live'], required: true },
    },
  },
}

const collectionsUi = defineCollectionsUi({
  pages: {
    label: { singular: { en: 'Page', de: 'Seite' }, plural: { en: 'Pages', de: 'Seiten' } },
    workflow: { field: 'status', live: 'live', draft: 'entwurf' },
  },
}, contentTypes)

const answer: AdminSchema = {
  locales: { all: ['de', 'en'], primary: 'de', prefixPrimary: true },
  collections: serializeCollections(contentTypes, collectionsUi),
  features: ['delivery', 'references'],
}

let requests = 0

const unregister: (() => void)[] = []

beforeEach(() => {
  requests = 0
  useSchema().clear()
  unregister.push(registerEndpoint('/api/admin/schema', {
    method: 'GET',
    handler: () => {
      requests += 1
      return answer
    },
  }))
})

afterEach(() => {
  unregister.splice(0).forEach((stop) => stop())
  useSchema().clear()
})

describe('useSchema', () => {
  it('requests the schema once per admin session', async () => {
    expect(await useSchema().load()).toBe('ok')
    expect(await useSchema().load()).toBe('ok')

    expect(requests).toBe(1)
    expect(useSchema().schema.value).toEqual(answer)
  })

  it('shares one request between concurrent loads', async () => {
    const outcomes = await Promise.all([useSchema().load(), useSchema().load(), useSchema().load()])

    expect(outcomes).toEqual(['ok', 'ok', 'ok'])
    expect(requests).toBe(1)
  })

  it('requests it again after a reset', async () => {
    await useSchema().load()
    useSchema().clear()
    expect(useSchema().schema.value).toBeNull()

    await useSchema().load()
    expect(requests).toBe(2)
  })
})

describe('schema clients', () => {
  it('serve the collections, features and locales of the loaded schema', async () => {
    await useSchema().load()

    expect(useCollections().collections.value.map((c) => c.name)).toEqual(['pages'])
    expect(useCollections().collections.value[0]?.workflow).toEqual({ field: 'status', live: 'live', draft: 'entwurf' })
    expect(useFeatures().has('delivery')).toBe(true)
    expect(useFeatures().has('images')).toBe(false)
    expect(useFeatures().features.value).toEqual(['delivery', 'references'])

    const locales = useContentLocales()
    expect(locales.locales.value).toEqual(['de', 'en'])
    expect(locales.primary.value).toBe('de')
    expect(locales.prefixPrimary.value).toBe(true)
  })

  it('follow the schema as it arrives instead of freezing at setup time', async () => {
    const collections = useCollections().collections
    const { primary } = useContentLocales()
    const { has } = useFeatures()

    expect(collections.value).toEqual([])
    expect(primary.value).toBe('')
    expect(has('delivery')).toBe(false)

    await useSchema().load()

    expect(collections.value.map((c) => c.name)).toEqual(['pages'])
    expect(primary.value).toBe('de')
    expect(has('delivery')).toBe(true)
  })
})
