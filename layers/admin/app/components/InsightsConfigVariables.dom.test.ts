import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { InsightsConfigVariable } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import InsightsConfigVariables from './InsightsConfigVariables.vue'

const variables: InsightsConfigVariable[] = [
  { path: 'set.explicit', type: 'string', required: true, secret: false, set: true, status: 'set' },
  { path: 'default.explicit', type: 'string', required: true, default: 'inherited', secret: false, set: false, status: 'default' },
  { path: 'missing.required', type: 'string', required: true, secret: false, set: false, status: 'missing' },
  { path: 'missing.optional', type: 'string', required: false, secret: false, set: false, status: 'missing' },
  { path: 'set.fallback', type: 'string', required: true, secret: false, set: true },
  { path: 'missing.fallback', type: 'string', required: true, secret: false, set: false },
]

describe('InsightsConfigVariables', () => {
  it('renders set, default and missing status rows, including the pre-status fallback', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables } })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(variables.length)

    const dot = (row: (typeof rows)[number]) => row.get('.insights-config__dot')

    expect(dot(rows[0]!).classes()).toContain('insights-config__dot--set')
    expect(rows[0]!.text()).toContain(en['insights.set'])

    expect(dot(rows[1]!).classes()).toContain('insights-config__dot--default')
    expect(rows[1]!.text()).toContain(en['insights.default'])
    expect(dot(rows[1]!).attributes('title')).toBe(en['insights.defaultHint'])
    expect(dot(rows[1]!).attributes('aria-hidden')).toBe('true')

    expect(dot(rows[2]!).classes()).toContain('insights-config__dot--danger')
    expect(rows[2]!.text()).toContain(en['insights.notSet'])

    expect(dot(rows[3]!).classes()).toContain('insights-config__dot--muted')
    expect(rows[3]!.text()).toContain(en['insights.notSet'])

    expect(dot(rows[4]!).classes()).toContain('insights-config__dot--set')
    expect(rows[4]!.text()).toContain(en['insights.set'])

    expect(dot(rows[5]!).classes()).toContain('insights-config__dot--danger')
    expect(rows[5]!.text()).toContain(en['insights.notSet'])
  })

  it('shows the effective value and keeps a redacted one hidden', async () => {
    const withValues: InsightsConfigVariable[] = [
      { path: 'root', type: 'string', required: true, secret: false, set: true, status: 'set', value: '/var/lib/kestrel', default: '/tmp', redacted: false },
      { path: 'sessionSecret', type: 'string', required: true, secret: true, set: true, status: 'set', value: null, redacted: true },
    ]
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables: withValues } })

    const cells = wrapper.findAll('tbody tr')[0]!.findAll('td')
    expect(cells[3]!.text()).toBe('"/var/lib/kestrel"')
    expect(cells[4]!.text()).toBe('"/tmp"')

    const secretRow = wrapper.findAll('tbody tr')[1]!
    expect(secretRow.findAll('td')[3]!.text()).toBe(en['insights.redacted'])
    expect(secretRow.text()).not.toContain('hunter')
  })

  it('names the table after the given heading', async () => {
    const wrapper = await mountSuspended(InsightsConfigVariables, { props: { variables, labelledBy: 'heading-id', scroll: false } })

    expect(wrapper.get('table').attributes('aria-labelledby')).toBe('heading-id')
  })
})
