import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { InsightsManifest } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import manifestFixture from '../utils/__fixtures__/insights-manifest.json'
import InsightsGraph from './InsightsGraph.vue'

const manifest = boundaryCast<InsightsManifest>(manifestFixture, 'json')

function stubMatchMedia(matches: boolean) {
  const base: MediaQueryList = {
    matches,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }
  window.matchMedia = (media: string) => ({ ...base, media })
}

describe('InsightsGraph', () => {
  it('shows the interactive graph body on a wide viewport', async () => {
    stubMatchMedia(false)
    const wrapper = await mountSuspended(InsightsGraph, { props: { manifest } })
    await nextTick()

    expect(wrapper.find('.insights-graph__body').exists()).toBe(true)
    expect(wrapper.find('.insights-graph__alt--phone').exists()).toBe(false)
  })

  it('replaces the graph with a text alternative on a phone viewport', async () => {
    stubMatchMedia(true)
    const wrapper = await mountSuspended(InsightsGraph, { props: { manifest } })
    await nextTick()

    expect(wrapper.find('.insights-graph__body').exists()).toBe(false)
    expect(wrapper.find('.insights-graph__alt--phone').exists()).toBe(true)
  })
})
