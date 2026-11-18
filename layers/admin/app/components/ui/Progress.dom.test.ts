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

  it('defaults to the medium size and the default tone', async () => {
    const wrapper = await mountSuspended(Progress, { props: { value: 10, label: 'Uploading' } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.classes()).toContain('ui-progress--md')
    expect(bar.classes()).toContain('ui-progress--default')
  })

  it('renders a warning and a muted tone', async () => {
    const warning = await mountSuspended(Progress, { props: { value: 100, label: 'Variants', tone: 'warning' } })
    const muted = await mountSuspended(Progress, { props: { value: 40, label: 'Cancelled', tone: 'muted' } })

    expect(warning.get('[role="progressbar"]').classes()).toContain('ui-progress--warning')
    expect(muted.get('[role="progressbar"]').classes()).toContain('ui-progress--muted')
  })

  it('keeps an indeterminate bar labelled in a tone', async () => {
    const wrapper = await mountSuspended(Progress, { props: { label: 'Variants', valueText: '3 of 8 variants generated', tone: 'default', size: 'sm' } })

    const bar = wrapper.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
    expect(bar.attributes('aria-label')).toBe('Variants')
    expect(bar.attributes('aria-valuetext')).toBe('3 of 8 variants generated')
  })

  it('renders the small size and a success or danger tone', async () => {
    const success = await mountSuspended(Progress, { props: { value: 100, label: 'Done', size: 'sm', tone: 'success' } })
    const danger = await mountSuspended(Progress, { props: { value: 30, label: 'Failed', size: 'sm', tone: 'danger' } })

    expect(success.get('[role="progressbar"]').classes()).toEqual(expect.arrayContaining(['ui-progress--sm', 'ui-progress--success']))
    expect(danger.get('[role="progressbar"]').classes()).toEqual(expect.arrayContaining(['ui-progress--sm', 'ui-progress--danger']))
  })
})
