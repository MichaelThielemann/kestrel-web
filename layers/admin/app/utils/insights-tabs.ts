export const INSIGHTS_TABS = ['config', 'modules', 'pipelines', 'triggers', 'live', 'graph'] as const

export type InsightsTabId = typeof INSIGHTS_TABS[number]

export const DEFAULT_INSIGHTS_TAB: InsightsTabId = INSIGHTS_TABS[0]

export function isInsightsTab(value: string): value is InsightsTabId {
  return INSIGHTS_TABS.some((id) => id === value)
}

export function insightsTabFromQuery(value: unknown): InsightsTabId {
  return typeof value === 'string' && isInsightsTab(value) ? value : DEFAULT_INSIGHTS_TAB
}
