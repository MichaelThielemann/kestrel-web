import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { InsightsBootWarning } from '#kestrel-admin/types/api'
import InsightsBootWarnings from './InsightsBootWarnings.vue'

describe('InsightsBootWarnings', () => {
  it('renders nothing for an empty list', async () => {
    const wrapper = await mountSuspended(InsightsBootWarnings, { props: { warnings: [] } })
    expect(wrapper.find('details').exists()).toBe(false)
  })

  it('renders a warning of a known code with its translated field labels', async () => {
    const warnings: InsightsBootWarning[] = [{ code: 'unemitted-event', message: 'no pipeline emits it', pipeline: 'onBoom', event: 'probe.happened' }]
    const wrapper = await mountSuspended(InsightsBootWarnings, { props: { warnings } })
    expect(wrapper.text()).toContain('unemitted-event')
    expect(wrapper.text()).toContain('no pipeline emits it')
    expect(wrapper.text()).toContain('Pipeline')
    expect(wrapper.text()).toContain('onBoom')
  })

  it('renders a warning of an unknown code with its message and raw field labels', async () => {
    const warnings: InsightsBootWarning[] = [{ code: 'some-future-code', message: 'a new kind of warning', widget: 'thing' }]
    const wrapper = await mountSuspended(InsightsBootWarnings, { props: { warnings } })
    expect(wrapper.text()).toContain('some-future-code')
    expect(wrapper.text()).toContain('a new kind of warning')
    expect(wrapper.text()).toContain('widget')
    expect(wrapper.text()).toContain('thing')
  })
})
