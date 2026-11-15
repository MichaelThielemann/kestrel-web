import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { computed } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AdminSchema } from '#kestrel-admin/types/api'
import MediaVariantChip from './MediaVariantChip.vue'

const retryCapabilities: AdminSchema['capabilities'] = {
  imagesStatus: { method: 'GET', path: '/images/status' },
  retryFailedImages: { method: 'POST', path: '/images/retry' },
}
const schema: AdminSchema = {
  locales: { all: ['en'], primary: 'en', prefixPrimary: false },
  collections: [],
  features: [],
  capabilities: {},
}
mockNuxtImport('useSchema', () => () => ({
  schema: computed(() => schema),
  error: computed(() => null),
  load: () => Promise.resolve('ok' as const),
  clear: () => {},
}))

describe('MediaVariantChip', () => {
  beforeEach(() => {
    schema.capabilities = { ...retryCapabilities }
  })

  it('shows the count visibly for the pending state and carries the full sentence for screen readers', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'pending', done: 2, total: 5 } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('2/5')
    expect(wrapper.text()).toContain('Generating variants (2/5)')
    expect(wrapper.get('.media-variant-chip').attributes('title')).toBe('Generating variants (2/5)')
  })

  it('names the subject for the failed state, not a bare "Failed"', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'failed' } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('Variants failed')
    expect(wrapper.text()).toContain('Some variants could not be generated. Retry them under System → Images.')
    expect(wrapper.get('.media-variant-chip').attributes('title')).toBe('Some variants could not be generated. Retry them under System → Images.')
  })

  it.each([
    ['without the image status capability', { retryFailedImages: retryCapabilities.retryFailedImages! }],
    ['without the retry capability', { imagesStatus: retryCapabilities.imagesStatus! }],
    ['without either capability', {}],
  ])('points to an administrator instead of System → Images %s', async (_name, capabilities) => {
    schema.capabilities = capabilities
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'failed' } })

    const sentence = 'Some variants could not be generated. An administrator can retry them.'
    expect(wrapper.text()).toContain(sentence)
    expect(wrapper.text()).not.toContain('System')
    expect(wrapper.get('.media-variant-chip').attributes('title')).toBe(sentence)
  })

  it('names the subject for a stalled pending state, not a bare "Stalled", and keeps the pending state underneath', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'pending', stalled: true } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('Variants delayed')
    expect(wrapper.text()).toContain('Variants are still being generated. Check again later.')
    expect(wrapper.get('.media-variant-chip').attributes('title')).toBe('Variants are still being generated. Check again later.')
    expect(wrapper.get('.media-variant-chip').classes()).toContain('media-variant-chip--stalled')
    expect(wrapper.get('.media-variant-chip').classes()).not.toContain('media-variant-chip--pending')
  })
})
