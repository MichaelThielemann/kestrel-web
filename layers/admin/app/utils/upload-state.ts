import type { Translate } from '#kestrel-admin/actions/types'
import type { ProgressRowProgress, ProgressRowStatus, ProgressRowTone } from './progress-row'
import type { QueueEntry } from './upload-queue'

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
  }
}
