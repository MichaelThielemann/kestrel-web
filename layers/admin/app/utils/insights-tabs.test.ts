import { describe, expect, it } from 'vitest'
import { DEFAULT_INSIGHTS_TAB, INSIGHTS_TABS, insightsTabFromQuery, isInsightsTab } from './insights-tabs'

describe('insights tabs', () => {
  it('lands on the first tab of the strip', () => {
    expect(DEFAULT_INSIGHTS_TAB).toBe(INSIGHTS_TABS[0])
    expect(DEFAULT_INSIGHTS_TAB).toBe('config')
  })

  it('keeps a deep link to any other tab', () => {
    for (const tab of INSIGHTS_TABS) expect(insightsTabFromQuery(tab)).toBe(tab)
  })

  it('falls back to the first tab for a missing or unknown value', () => {
    expect(insightsTabFromQuery(undefined)).toBe(INSIGHTS_TABS[0])
    expect(insightsTabFromQuery(['modules'])).toBe(INSIGHTS_TABS[0])
    expect(insightsTabFromQuery('nope')).toBe(INSIGHTS_TABS[0])
  })

  it('recognises only the declared tabs', () => {
    expect(isInsightsTab('graph')).toBe(true)
    expect(isInsightsTab('Graph')).toBe(false)
  })
})
