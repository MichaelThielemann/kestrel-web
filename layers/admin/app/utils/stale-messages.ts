import type { StaleStatus } from '#kestrel-admin/types/api'
import type { IconName } from './icons'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The counts of the static delivery's re-render backlog the admin words, each with a key for one page and one for several. */
export type StaleCount = 'waiting' | 'failed' | 'unknown' | 'queued' | 'retried' | 'dashboardFailed'

const COUNT_KEYS: Record<StaleCount, { one: string, many: string, param: string }> = {
  waiting: { one: 'delivery.waitingOne', many: 'delivery.waiting', param: 'n' },
  failed: { one: 'delivery.failedRendersOne', many: 'delivery.failedRenders', param: 'n' },
  unknown: { one: 'delivery.unknownOne', many: 'delivery.unknown', param: 'n' },
  queued: { one: 'delivery.queuedOne', many: 'delivery.queued', param: 'marked' },
  retried: { one: 'delivery.retriedOne', many: 'delivery.retried', param: 'retried' },
  dashboardFailed: { one: 'dash.deliveryStaleFailedOne', many: 'dash.deliveryStaleFailed', param: 'n' },
}

/** The sentence for `n` pages of one backlog count, in the singular for exactly one page. */
export function staleCountText(t: Translate, count: StaleCount, n: number): string {
  const keys = COUNT_KEYS[count]
  return t(n === 1 ? keys.one : keys.many, { [keys.param]: n })
}

/** "`done` of `total` pages re-rendered", in the singular for a total of one page. */
export function staleProgressText(t: Translate, progress: { done: number, total: number }): string {
  return t(progress.total === 1 ? 'delivery.progressValueOne' : 'delivery.progressValue', { done: progress.done, total: progress.total })
}

export interface StaleLine { tone: 'waiting' | 'failed' | 'unknown' | 'current', icon: IconName, text: string }

/** One line per non-zero count, or a single line saying every page is current. */
export function staleLines(t: Translate, status: StaleStatus): StaleLine[] {
  const lines: StaleLine[] = []
  if (status.stale > 0) lines.push({ tone: 'waiting', icon: 'clock', text: staleCountText(t, 'waiting', status.stale) })
  if (status.failed > 0) lines.push({ tone: 'failed', icon: 'triangle-alert', text: staleCountText(t, 'failed', status.failed) })
  if (status.unknown > 0) lines.push({ tone: 'unknown', icon: 'info', text: staleCountText(t, 'unknown', status.unknown) })
  if (lines.length === 0) lines.push({ tone: 'current', icon: 'check', text: t('delivery.upToDate') })
  return lines
}

/**
 * What a polite live region says when the backlog moves from `previous` to `next`: that pages started waiting,
 * that a re-render failed, or how the backlog ended. `null` keeps the last announcement, so a backlog that only
 * shrinks between two polls is not read out again.
 */
export function staleAnnouncement(t: Translate, previous: StaleStatus | null, next: StaleStatus): string | null {
  if (previous === null) return null
  if (next.failed > previous.failed) return staleCountText(t, 'failed', next.failed)
  if (previous.stale === 0 && next.stale > 0) return staleCountText(t, 'waiting', next.stale)
  if (previous.stale > 0 && next.stale === 0) return next.failed > 0 ? staleCountText(t, 'failed', next.failed) : t('delivery.upToDate')
  return null
}
