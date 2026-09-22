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
    expect(row.findAll('td')).toHaveLength(6)
    const triggerCell = row.findAll('td')[2]!
    expect(triggerCell.classes()).toContain('insights-chip-cell')
    expect(triggerCell.find('.insights-chips').exists()).toBe(true)

    const chips = triggerCell.findAll('.insights-chips > .insights-chip')
    expect(chips).toHaveLength(2)

    const httpChip = chips[0]!
    expect(httpChip.text()).toBe('GET /admin/references/to/media/:id')
    expect(httpChip.attributes('title')).toBe('GET /admin/references/to/media/:id')

    const eventChip = chips[1]!
    expect(eventChip.text()).toBe('media.viewed')
  })

  it('renders a pipeline\'s atomic group as a labelled group of chips', async () => {
    unregister.push(registerEndpoint('/api/admin/insights/stats', { method: 'GET', handler: () => stats }))

    const grouped: InsightsManifest = {
      ...manifest,
      pipelines: [{
        name: 'createPage',
        steps: [
          { spec: 'authn.requireUser', name: 'authn.requireUser', module: 'authn/multi', description: { summary: '', reads: [], writes: [] } },
          { spec: 'content.create:pages', name: 'content.create', module: 'content/default', description: { summary: '', reads: [], writes: [] }, atomic: 1 },
          { spec: 'references.index:pages', name: 'references.index', module: 'references/default', description: { summary: '', reads: [], writes: [] }, atomic: 1 },
          { spec: 'events.emit:page.created', name: 'events.emit', module: 'events/inmemory', description: { summary: '', reads: [], writes: [] } },
        ],
      }],
      triggers: { http: [], events: [], crons: [] },
    }

    const wrapper = await mountSuspended(InsightsPipelines, { props: { manifest: grouped } })

    const stepCell = wrapper.get('tbody tr').findAll('td')[1]!
    const group = stepCell.get('.insights-chip-group')
    expect(group.attributes('role')).toBe('group')
    expect(group.attributes('aria-label')).toBeTruthy()
    expect(group.findAll('.insights-chip')).toHaveLength(2)
    expect(group.findAll('.insights-chip').map((chip) => chip.text())).toEqual(['content.create:pages', 'references.index:pages'])

    const chips = stepCell.findAll('.insights-chips > *')
    expect(chips[0]!.classes()).toContain('insights-chip')
    expect(chips[0]!.text()).toBe('authn.requireUser')
    expect(chips[2]!.text()).toBe('events.emit:page.created')
  })
})
