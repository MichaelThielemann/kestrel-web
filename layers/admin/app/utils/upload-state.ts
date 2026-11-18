import type { Translate } from '#kestrel-admin/actions/types'
import type { MediaVariantCounts } from '#kestrel-admin/types/api'
import type { ProgressRowProgress, ProgressRowStatus, ProgressRowTone } from './progress-row'
import type { QueueEntry, UploadSummary } from './upload-queue'
import { variantTotal } from './variant-state'

/** Where the image variants of one upload stand; `pending` carries counts once the server reported them. */
export type UploadVariantPhase =
  | { kind: 'none' }
  | { kind: 'pending'; done?: number; total?: number }
  | { kind: 'stalled' }
  | { kind: 'failed'; failed: number; total: number }
  | { kind: 'ready' }

/** What an upload's variants are read from: the polled entry of its file, else the upload's own response. */
export interface UploadVariantSource {
  variantCounts?: MediaVariantCounts
  available?: boolean
}

export interface UploadVariantContext {
  /** Whether the images feature is on, so that image uploads get variants at all. */
  images: boolean
  source?: UploadVariantSource
  /** The variants have taken longer than the poller waits. */
  stalled?: boolean
}

type PhaseEntry = Pick<QueueEntry, 'status'> & { file: { type: string }; result?: { contentType: string } }

/** The variant phase of one upload: before the response an image is `pending` without counts, after it the counts decide; a file without variants is `none`. */
export function uploadVariantPhase(item: PhaseEntry, context: UploadVariantContext): UploadVariantPhase {
  if (!context.images) return { kind: 'none' }
  if (item.status === 'processing') return item.file.type.startsWith('image/') ? { kind: 'pending' } : { kind: 'none' }
  if (item.status !== 'done' || !item.result?.contentType.startsWith('image/')) return { kind: 'none' }
  if (context.stalled) return { kind: 'stalled' }
  const counts = context.source?.variantCounts
  if (!counts) return { kind: 'pending' }
  const total = variantTotal(counts)
  if (context.source?.available === false || counts.pending > 0) return total > 0 ? { kind: 'pending', done: counts.done, total } : { kind: 'pending' }
  if (total === 0) return { kind: 'none' }
  const failed = counts.error + counts.failed
  return failed > 0 ? { kind: 'failed', failed, total } : { kind: 'ready' }
}

/** How one upload shows its state: status icon and text, a bar only while it uploads or its variants are generated, a message line and the row tone. */
export interface UploadStateView {
  status: ProgressRowStatus
  progress?: ProgressRowProgress
  message?: string
  tone: ProgressRowTone
}

/** The variant phase a row shows, and whether the viewer may retry failed variants. */
export interface UploadStateVariants {
  phase: UploadVariantPhase
  canRetry?: boolean
}

type Entry = Pick<QueueEntry, 'status' | 'progress' | 'message'> & { filename: string; totalKnown?: boolean }

function variantsView(phase: UploadVariantPhase, label: string, canRetry: boolean, t: Translate): UploadStateView | null {
  switch (phase.kind) {
    case 'pending': {
      if (phase.total === undefined || phase.done === undefined) {
        const text = t('media.upload.processing')
        return { tone: 'default', status: { text, busy: true }, progress: { label, valueText: text } }
      }
      const counts = { done: phase.done, total: phase.total }
      return {
        tone: 'default',
        status: { text: t('media.upload.variantsProgress', counts), busy: true },
        progress: { value: (phase.done / phase.total) * 100, label, valueText: t('media.upload.variantsValue', counts) },
      }
    }
    case 'stalled':
      return { tone: 'default', status: { text: t('media.tile.variantsStalledShort'), icon: 'clock', tone: 'muted' }, message: t('media.tile.variantsStalled') }
    case 'failed':
      return {
        tone: 'default',
        status: { text: t('media.upload.variantsFailedCount', { n: phase.failed, total: phase.total }), icon: 'triangle-alert', tone: 'warning' },
        message: t(canRetry ? 'media.tile.variantsFailedRetry' : 'media.tile.variantsFailedAsk'),
      }
    default:
      return null
  }
}

export function uploadStateView(item: Entry, t: Translate, variants?: UploadStateVariants): UploadStateView {
  const label = t('media.upload.progressLabel', { name: item.filename })
  if (variants && (item.status === 'processing' || item.status === 'done')) {
    const view = variantsView(variants.phase, label, variants.canRetry === true, t)
    if (view) return view
  }
  switch (item.status) {
    case 'queued':
      return { tone: 'muted', status: { text: t('media.tile.queued'), icon: 'clock', tone: 'muted' } }
    case 'uploading': {
      const text = item.totalKnown ? t('media.tile.percent', { percent: item.progress }) : t('media.upload.uploading')
      return { tone: 'default', status: { text, busy: true }, progress: { value: item.totalKnown ? item.progress : undefined, label, valueText: text } }
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

/** How a whole run shows in the panel header: its status, the upload count, a detail line on variant trouble, the text for the live region, the overall bar's percent and tone. */
export interface UploadRunView {
  /** While files upload, a spinner with the count; then the variant phase, then the outcome. */
  status: ProgressRowStatus
  countText: string
  /** Files whose variants failed or were delayed, once no file's variants are pending. */
  detail?: string
  /** What screen readers hear: the count and the phase, never the per-file variant progress. */
  liveText: string
  /** Settled files plus the sent share of the running ones, in percent of the files to be sent. */
  overall: number
  barTone: NonNullable<ProgressRowProgress['tone']>
}

interface VariantTally { files: number; pending: number; failed: number; stalled: number }

function tally(phases: readonly UploadVariantPhase[]): VariantTally {
  const counts: VariantTally = { files: 0, pending: 0, failed: 0, stalled: 0 }
  for (const phase of phases) {
    if (phase.kind === 'none') continue
    counts.files++
    if (phase.kind === 'pending') counts.pending++
    else if (phase.kind === 'failed') counts.failed++
    else if (phase.kind === 'stalled') counts.stalled++
  }
  return counts
}

function filesText(t: Translate, key: string, params: { n?: number; done?: number; total: number }): string {
  return t(params.total === 1 ? `${key}One` : key, params)
}

function finishedStatus(summary: UploadSummary, variants: VariantTally, t: Translate): ProgressRowStatus {
  if (variants.pending) return { text: filesText(t, 'media.upload.variantsFiles', { done: variants.files - variants.pending - variants.stalled, total: variants.files }), busy: true }
  if (summary.failed) return { text: t('media.upload.finished'), icon: 'circle-x', tone: 'danger' }
  if (summary.cancelled) return { text: t('media.upload.finished'), icon: 'x', tone: 'muted' }
  if (variants.failed) return { text: t('media.upload.done'), icon: 'triangle-alert', tone: 'warning' }
  if (variants.stalled) return { text: t('media.upload.done'), icon: 'clock', tone: 'muted' }
  return { text: t('media.upload.done'), icon: 'circle-check', tone: 'success' }
}

function variantDetail(variants: VariantTally, t: Translate): string | undefined {
  if (variants.pending) return undefined
  const parts: string[] = []
  if (variants.failed) parts.push(filesText(t, 'media.upload.variantsFailedFiles', { n: variants.failed, total: variants.files }))
  if (variants.stalled) parts.push(filesText(t, 'media.upload.variantsStalledFiles', { n: variants.stalled, total: variants.files }))
  return parts.length ? parts.join('. ') : undefined
}

/** The header of a run; `phases` are the variant phases of its uploads, in any order. */
export function uploadRunView(summary: UploadSummary, t: Translate, items: readonly Pick<QueueEntry, 'status' | 'progress'>[], phases: readonly UploadVariantPhase[] = []): UploadRunView {
  const { done, total, failed, cancelled, skipped } = summary
  const parts = [t('media.upload.summary', { done, total })]
  if (failed) parts.push(t('media.upload.countFailed', { n: failed }))
  if (cancelled) parts.push(t('media.upload.countCancelled', { n: cancelled }))
  if (skipped) parts.push(t('media.upload.countSkipped', { n: skipped }))
  const countText = parts.join(', ')
  const running = items.reduce((sum, item) => (item.status === 'uploading' || item.status === 'processing' ? sum + item.progress / 100 : sum), 0)
  const overall = total ? ((summary.settled + running) / total) * 100 : 0
  const variants = tally(phases)

  if (!summary.finished) return { status: { text: countText, busy: true }, countText, liveText: countText, overall, barTone: 'default' }

  const status = finishedStatus(summary, variants, t)
  const detail = variantDetail(variants, t)
  const liveText = variants.pending
    ? `${countText}. ${t('media.upload.processing')}`
    : [`${status.text} ${countText}`, detail].filter(Boolean).join('. ')
  let barTone: UploadRunView['barTone'] = 'default'
  if (failed) barTone = 'danger'
  else if (done === total && !variants.pending && !variants.failed && !variants.stalled) barTone = 'success'
  return { status, countText, detail, liveText, overall, barTone }
}
