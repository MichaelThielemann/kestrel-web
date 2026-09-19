import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { InsightsConfigVariable } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import InsightsConfigValue from './InsightsConfigValue.vue'

function variable(patch: Partial<InsightsConfigVariable> = {}): InsightsConfigVariable {
  return { path: 'a.b', type: 'string', required: false, secret: false, set: true, ...patch }
}

describe('InsightsConfigValue', () => {
  it('shows a lock and the redacted text instead of a secret value', async () => {
    const wrapper = await mountSuspended(InsightsConfigValue, { props: { variable: variable({ secret: true, value: 'hunter2' }) } })

    expect(wrapper.text()).toContain(en['insights.redacted'])
    expect(wrapper.text()).not.toContain('hunter2')
    expect(wrapper.get('svg').attributes('data-icon')).toBe('lock')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('treats a backend-flagged redaction the same way', async () => {
    const wrapper = await mountSuspended(InsightsConfigValue, { props: { variable: variable({ redacted: true, value: 'hunter2' }) } })

    expect(wrapper.text()).toContain(en['insights.redacted'])
    expect(wrapper.text()).not.toContain('hunter2')
  })

  it('renders a dash when the backend sends no value', async () => {
    const wrapper = await mountSuspended(InsightsConfigValue, { props: { variable: variable() } })

    expect(wrapper.text()).toBe('—')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('renders a short value without a copy button and keeps the full text in title', async () => {
    const wrapper = await mountSuspended(InsightsConfigValue, { props: { variable: variable({ value: 'short' }) } })

    const text = wrapper.get('.insights-value__text')
    expect(text.text()).toBe('"short"')
    expect(text.attributes('title')).toBe('"short"')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('offers a copy button for a long value', async () => {
    const long = 'x'.repeat(200)
    const wrapper = await mountSuspended(InsightsConfigValue, { props: { variable: variable({ value: long }) } })

    expect(wrapper.get('.insights-value__text').attributes('title')).toBe(JSON.stringify(long))
    expect(wrapper.get('button').attributes('aria-label')).toBe((en['insights.copyValue'] ?? '').replace('{path}', 'a.b'))
  })

  it('renders the default when asked for that field', async () => {
    const wrapper = await mountSuspended(InsightsConfigValue, { props: { variable: variable({ default: 'inherited', value: 'set' }), field: 'default' } })

    expect(wrapper.get('.insights-value__text').text()).toBe('"inherited"')
  })
})
