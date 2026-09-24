import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import Progress from './Progress.vue'

describe('KestrelUiProgress', () => {
  it('reports the given percent when determinate', async () => {
    const wrapper = await mountSuspended(Progress, { props: { value: 42, label: 'Uploading: a.png', valueText: '42 %' } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('42')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('100')
    expect(bar.attributes('aria-valuetext')).toBe('42 %')
    expect(bar.attributes('aria-label')).toBe('Uploading: a.png')
  })

  it('omits aria-valuenow when indeterminate', async () => {
    const wrapper = await mountSuspended(Progress, { props: { label: 'Processing', valueText: 'Processing…' } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
    expect(bar.classes()).toContain('ui-progress--indeterminate')
  })

  it('clamps an out-of-range value', async () => {
    const wrapper = await mountSuspended(Progress, { props: { value: 140, label: 'Uploading' } })

    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
  })
})
