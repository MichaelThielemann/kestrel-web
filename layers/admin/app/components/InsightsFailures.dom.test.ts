import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { InsightsRecentFailure } from '#kestrel-admin/types/api'
import { en } from '#kestrel-admin/i18n/en'
import InsightsFailures from './InsightsFailures.vue'

const failures: InsightsRecentFailure[] = [
  { at: 1757603500000, runId: 'r-2', pipeline: 'login', trigger: { kind: 'http', name: 'POST /login' }, status: 401, ms: 41, code: 'UNAUTHENTICATED', step: 'authn.login', message: 'invalid credentials' },
  { at: 1757603300000, runId: 'r-1', pipeline: 'listPages', trigger: { kind: 'cron', name: '0 3 * * *' }, status: 429, ms: 1 },
]

describe('InsightsFailures', () => {
  it('lists every failure with its code, step, message and run id', async () => {
    const wrapper = await mountSuspended(InsightsFailures, { props: { failures } })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)

    const cells = rows[0]!.findAll('td')
    expect(cells[1]!.text()).toBe('login')
    expect(cells[2]!.text()).toBe('POST /login')
    expect(cells[2]!.get('.insights-chip').attributes('title')).toBe('http POST /login')
    expect(cells[3]!.text()).toBe('401')
    expect(cells[3]!.classes()).toContain('insights-num')
    expect(cells[4]!.text()).toBe('UNAUTHENTICATED')
    expect(cells[5]!.text()).toBe('authn.login')
    expect(cells[6]!.text()).toBe('invalid credentials')
    expect(cells[7]!.text()).toBe('r-2')
  })

  it('writes an em dash where the run carried no code, step or message', async () => {
    const wrapper = await mountSuspended(InsightsFailures, { props: { failures } })

    const cells = wrapper.findAll('tbody tr')[1]!.findAll('td')
    expect(cells[5]!.text()).toBe('—')
    expect(cells[6]!.text()).toBe('—')
  })

  it('renders the empty state when the backend reports no failure', async () => {
    const wrapper = await mountSuspended(InsightsFailures, { props: { failures: [] } })

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.get('.ui-empty').text()).toContain(en['insights.noFailures'])
  })
})
