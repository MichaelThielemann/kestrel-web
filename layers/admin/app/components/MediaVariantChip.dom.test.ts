import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import MediaVariantChip from './MediaVariantChip.vue'

describe('MediaVariantChip', () => {
  it('shows the count visibly for the pending state and carries the full sentence for screen readers', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'pending', done: 2, total: 5 } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('2/5')
    expect(wrapper.text()).toContain('Generating variants (2/5)')
  })

  it('shows a short visible word for the failed state and the full sentence for screen readers', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'failed' } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('Failed')
    expect(wrapper.text()).toContain('Some variants could not be generated')
  })

  it('shows a short visible word for the stalled state and the full sentence for screen readers', async () => {
    const wrapper = await mountSuspended(MediaVariantChip, { props: { state: 'stalled' } })

    expect(wrapper.get('[aria-hidden="true"].media-variant-chip__text').text()).toBe('Stalled')
    expect(wrapper.text()).toContain('Variants are still being generated. Check again later.')
  })
})
