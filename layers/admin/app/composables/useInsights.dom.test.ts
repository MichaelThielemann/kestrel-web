import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminSchema, InsightsManifest } from '#kestrel-admin/types/api'
import { useAuth } from './useAuth'
import { useInsights } from './useInsights'
import { useSchema } from './useSchema'

const manifest: InsightsManifest = {
  generatedAt: 0,
  core: { version: '1.0.0' },
  contracts: [],
  modules: [],
  steps: [],
  pipelines: [],
  triggers: { http: [], events: [], crons: [] },
  warnings: [],
}

const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: { insightsManifest: { method: 'GET', path: '/insights' } },
}

describe('insights cache on identity change', () => {
  const unregisterAll: (() => void)[] = []

  afterEach(() => {
    unregisterAll.splice(0).forEach((unregister) => unregister())
    useSchema().clear()
  })

  it('clears the cached manifest when the signed-in user resets, so a second user does not see it', async () => {
    unregisterAll.push(registerEndpoint('/api/admin/schema', { method: 'GET', handler: () => schema }))
    await useSchema().load()
    unregisterAll.push(registerEndpoint('/api/insights', { method: 'GET', handler: () => manifest }))

    await useInsights().loadManifest()
    expect(useInsights().manifest.value).toEqual(manifest)
    expect(useInsights().availability.value).toBe('ok')

    useAuth().reset()

    expect(useInsights().manifest.value).toBeNull()
    expect(useInsights().availability.value).toBe('unknown')
  })
})
