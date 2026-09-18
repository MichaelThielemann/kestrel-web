import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import type { InsightsManifest, InsightsStats } from '#kestrel-admin/types/api'
import InsightsPipelines from './InsightsPipelines.vue'

const manifest: InsightsManifest = {
  generatedAt: 0,
  core: { version: '1.0.0' },
  contracts: [],
  modules: [],
  steps: [],
  pipelines: [{
    name: 'media.get',
    steps: [{ spec: 'media.readById', name: 'readById', module: 'media-default', description: { summary: '', reads: [], writes: [] } }],
  }],
  triggers: {
    http: [{ method: 'GET', path: '/admin/references/to/media/:id', pipeline: 'media.get' }],
    events: [{ event: 'media.viewed', pipeline: 'media.get' }],
    crons: [],
  },
}

const stats: InsightsStats = {
  generatedAt: 0,
  process: { pid: 1, startedAt: 0, uptimeMs: 0 },
  runs: { active: 0, total: 0, failed: 0, errors: 0 },
  pipelines: [],
  steps: [],
  events: [],
  ratelimit: [],
}

describe('InsightsPipelines trigger chips', () => {
  const unregister: (() => void)[] = []

  afterEach(() => {
    unregister.splice(0).forEach((fn) => fn())
  })

  it('keeps a space-containing trigger label in one chip and wraps between chips on the shared cell class', async () => {
    unregister.push(registerEndpoint('/api/admin/insights/stats', { method: 'GET', handler: () => stats }))

    const wrapper = await mountSuspended(InsightsPipelines, { props: { manifest } })

    const row = wrapper.get('tbody tr')
    const triggerCell = row.findAll('td')[2]!
    expect(triggerCell.classes()).toContain('insights-chip-cell')

    const chips = triggerCell.findAll('.insights-chip')
    expect(chips).toHaveLength(2)

    const httpChip = chips[0]!
    expect(httpChip.text()).toBe('GET /admin/references/to/media/:id')
    expect(httpChip.attributes('title')).toBe('GET /admin/references/to/media/:id')

    const eventChip = chips[1]!
    expect(eventChip.text()).toBe('media.viewed')
  })
})
