import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import MediaVariantChip from './MediaVariantChip.vue'

describe('MediaVariantChip', () => {
  it('shows the count visibly for the pending state and carries the full sentence for screen readers', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'pending', done: 2, total: 5 } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('2/5')
    expect(wrapper.text()).toContain('Generating variants (2/5)')
    expect(wrapper.get('.media-variant-chip').attributes('title')).toBe('Generating variants (2/5)')
  })

  it('names the subject for the failed state, not a bare "Failed"', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'failed' } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('Variants failed')
    expect(wrapper.text()).toContain('Some variants could not be generated')
    expect(wrapper.get('.media-variant-chip').attributes('title')).toBe('Some variants could not be generated')
  })

  it('names the subject for the stalled state, not a bare "Stalled"', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'stalled' } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('Variants delayed')
    expect(wrapper.text()).toContain('Variants are still being generated. Check again later.')
    expect(wrapper.get('.media-variant-chip').attributes('title')).toBe('Variants are still being generated. Check again later.')
  })
})
