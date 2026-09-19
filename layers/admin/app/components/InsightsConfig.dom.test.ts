import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { InsightsManifest, InsightsModule } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import { en } from '#kestrel-admin/i18n/en'
import manifestFixture from '../utils/__fixtures__/insights-manifest.json'
import InsightsConfig from './InsightsConfig.vue'

const base = boundaryCast<InsightsManifest>(manifestFixture, 'json')

function moduleWith(name: string, variables: InsightsModule['config']['variables']): InsightsModule {
  return { name, use: name, version: null, provides: [], requires: [], optional: [], config: { schema: {}, variables }, steps: [], eventHook: false }
}

const manifest: InsightsManifest = {
  ...base,
  modules: [
    moduleWith('blobstore/filesystem', [
      { path: 'root', type: 'string', required: true, secret: false, set: true, status: 'set', value: '/var/lib/kestrel', redacted: false },
    ]),
    moduleWith('authn/multi', [
      { path: 'sessionSecret', type: 'string', required: true, secret: true, set: true, status: 'set', value: null, redacted: true },
    ]),
    moduleWith('events/inmemory', []),
  ],
}

describe('InsightsConfig', () => {
  it('groups the variables per module and links to the module detail', async () => {
    const wrapper = await mountSuspended(InsightsConfig, { props: { manifest } })

    const headings = wrapper.findAll('.insights-config-tab__module')
    expect(headings.map((h) => h.text())).toEqual(['authn/multi', 'blobstore/filesystem'])
    expect(headings[0]!.get('a').attributes('href')).toBe('/admin/insights/modules/authn/multi')
    expect(wrapper.findAll('table')).toHaveLength(2)
  })

  it('names every table after its module heading', async () => {
    const wrapper = await mountSuspended(InsightsConfig, { props: { manifest } })

    const heading = wrapper.get('.insights-config-tab__module')
    expect(wrapper.get('table').attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })

  it('shows the effective value and never a redacted one', async () => {
    const wrapper = await mountSuspended(InsightsConfig, { props: { manifest } })

    expect(wrapper.text()).toContain('"/var/lib/kestrel"')
    expect(wrapper.text()).toContain(en['insights.redacted'])
  })

  it('filters by module, path and value', async () => {
    const wrapper = await mountSuspended(InsightsConfig, { props: { manifest } })
    const input = wrapper.get('input')

    await input.setValue('var/lib')
    expect(wrapper.findAll('.insights-config-tab__module').map((h) => h.text())).toEqual(['blobstore/filesystem'])

    await input.setValue('authn')
    expect(wrapper.findAll('.insights-config-tab__module').map((h) => h.text())).toEqual(['authn/multi'])

    await input.setValue('sessionSecret')
    expect(wrapper.findAll('.insights-config-tab__module').map((h) => h.text())).toEqual(['authn/multi'])

    await input.setValue('nothing-matches')
    expect(wrapper.findAll('.insights-config-tab__module')).toHaveLength(0)
    expect(wrapper.text()).toContain(en['insights.noConfigVariables'])
  })

  it('keeps the modules without config behind a collapsed disclosure', async () => {
    const wrapper = await mountSuspended(InsightsConfig, { props: { manifest } })

    const toggle = wrapper.get('.insights-config-tab__rest button')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('insights-config-without')

    const list = wrapper.get('#insights-config-without')
    expect(list.attributes('style')).toContain('display: none')

    await toggle.trigger('click')
    expect(wrapper.get('.insights-config-tab__rest button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#insights-config-without').attributes('style')).not.toContain('display: none')
    expect(list.text()).toContain('events/inmemory')
  })
})
