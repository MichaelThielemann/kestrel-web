import type { Translate } from '#kestrel-admin/actions/types'
import type { ProgressRowProgress, ProgressRowStatus, ProgressRowTone } from './progress-row'
import type { QueueEntry, UploadSummary } from './upload-queue'

/** How one upload shows its state: status icon and text, a bar only while it uploads or is processed, a message line and the row tone. */
export interface UploadStateView {
  status: ProgressRowStatus
  progress?: ProgressRowProgress
  message?: string
  tone: ProgressRowTone
}

type Entry = Pick<QueueEntry, 'status' | 'progress' | 'message'> & { filename: string; totalKnown?: boolean }

export function uploadStateView(item: Entry, t: Translate): UploadStateView {
  const label = t('media.upload.progressLabel', { name: item.filename })
  switch (item.status) {
    case 'queued':
      return { tone: 'muted', status: { text: t('media.tile.queued'), icon: 'clock', tone: 'muted' } }
    case 'uploading': {
      const text = item.totalKnown ? t('media.tile.percent', { percent: item.progress }) : t('media.upload.uploading')
      return { tone: 'default', status: { text }, progress: { value: item.totalKnown ? item.progress : undefined, label, valueText: text } }
    }
    case 'processing':
      return { tone: 'default', status: { text: t('media.tile.processing'), busy: true }, progress: { value: 100, label, valueText: t('media.tile.processing') } }
    case 'done':
      return { tone: 'default', status: { text: t('media.upload.done'), icon: 'circle-check', tone: 'success' } }
    case 'failed':
      return { tone: 'danger', status: { text: t('media.upload.failed'), icon: 'circle-x', tone: 'danger' }, message: item.message }
    case 'cancelled':
      return { tone: 'muted', status: { text: t('media.upload.cancelled'), icon: 'x', tone: 'muted' } }
    case 'skipped':
      return { tone: 'muted', status: { text: t('media.upload.wasSkipped'), icon: 'minus', tone: 'muted' }, message: item.message }
  }
}

/** How a whole run shows in the panel header: the summary line, the finished status, the overall bar's percent and tone. */
export interface UploadRunView {
  countText: string
  finished: Required<Pick<ProgressRowStatus, 'text' | 'icon' | 'tone'>>
  /** Settled files plus the sent share of the running ones, in percent of the files to be sent. */
  overall: number
  barTone: NonNullable<ProgressRowProgress['tone']>
}

export function uploadRunView(summary: UploadSummary, t: Translate, items: readonly Pick<QueueEntry, 'status' | 'progress'>[]): UploadRunView {
  const { done, total, failed, cancelled, skipped } = summary
  const parts = [t('media.upload.summary', { done, total })]
  if (failed) parts.push(t('media.upload.countFailed', { n: failed }))
  if (cancelled) parts.push(t('media.upload.countCancelled', { n: cancelled }))
  if (skipped) parts.push(t('media.upload.countSkipped', { n: skipped }))
  const countText = parts.join(', ')
  const running = items.reduce((sum, item) => (item.status === 'uploading' || item.status === 'processing' ? sum + item.progress / 100 : sum), 0)
  const overall = total ? ((summary.settled + running) / total) * 100 : 0
  const clean = !failed && !cancelled
  const finished: UploadRunView['finished'] = clean
    ? { text: t('media.upload.done'), icon: 'circle-check', tone: 'success' }
    : { text: t('media.upload.finished'), icon: failed ? 'circle-x' : 'x', tone: failed ? 'danger' : 'muted' }
  let barTone: UploadRunView['barTone'] = 'default'
  if (summary.finished && failed) barTone = 'danger'
  else if (summary.finished && done === total) barTone = 'success'
  return { countText, finished, overall, barTone }
}
