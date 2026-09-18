import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import { useSchema } from '#kestrel-admin/composables/useSchema'
import { useCollections } from '#kestrel-admin/composables/useCollections'
import { useContentLocales } from '#kestrel-admin/composables/useContentLocales'
import { useFeatures } from '#kestrel-admin/composables/useFeatures'

const answer: AdminSchema = {
  locales: { all: ['de', 'en'], primary: 'de', prefixPrimary: true },
  collections: [
    {
      name: 'pages',
      mode: 'multi',
      translatable: true,
      pageLike: true,
      seo: true,
      status: true,
      layoutField: false,
      blocks: { enabled: true },
      editor: 'blocks',
      nav: true,
      placement: 'rail',
      fields: {},
      workflow: { field: 'status', live: 'live', draft: 'entwurf' },
    },
  ],
  features: ['delivery', 'references'],
  capabilities: { pipelines: ['listPages'] },
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
    expect(useCollections().load()).toHaveLength(1)
    expect(useFeatures().has('delivery')).toBe(true)
    expect(useFeatures().has('images')).toBe(false)
    expect(useFeatures().features.value).toEqual(['delivery', 'references'])
    expect(useContentLocales()).toEqual({ locales: ['de', 'en'], primary: 'de', prefixPrimary: true })
  })

  it('stay empty while no schema is loaded', () => {
    expect(useCollections().collections.value).toEqual([])
    expect(useFeatures().has('delivery')).toBe(false)
    expect(useContentLocales()).toEqual({ locales: [], primary: '', prefixPrimary: false })
  })
})
