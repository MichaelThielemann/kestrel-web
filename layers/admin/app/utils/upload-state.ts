import type { Translate } from '#kestrel-admin/actions/types'
import type { MediaVariantCounts } from '#kestrel-admin/types/api'
import type { ProgressRowProgress, ProgressRowStatus, ProgressRowTone, ProgressTone } from './progress-row'
import type { QueueEntry, UploadSummary } from './upload-queue'
import { variantTotal } from './variant-state'

/** Where the image variants of one upload stand; `pending` carries counts once the server reported them, and `generating` once the server is at work on them. */
export type UploadVariantPhase =
  | { kind: 'none' }
  | { kind: 'pending'; done?: number; total?: number; generating?: boolean }
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

/**
 * The variant phase of one upload: before the response an image is `pending` and `generating` without counts, after it
 * the counts decide, and it is `generating` once a size is done or failed; a file without variants is `none`.
 */
export function uploadVariantPhase(item: PhaseEntry, context: UploadVariantContext): UploadVariantPhase {
  if (!context.images) return { kind: 'none' }
  if (item.status === 'processing') return item.file.type.startsWith('image/') ? { kind: 'pending', generating: true } : { kind: 'none' }
  if (item.status !== 'done' || !item.result?.contentType.startsWith('image/')) return { kind: 'none' }
  if (context.stalled) return { kind: 'stalled' }
  const counts = context.source?.variantCounts
  if (!counts) return { kind: 'pending' }
  const total = variantTotal(counts)
  const failed = counts.error + counts.failed
  if (context.source?.available === false || counts.pending > 0) {
    if (total === 0) return { kind: 'pending' }
    return counts.done + failed > 0 ? { kind: 'pending', done: counts.done, total, generating: true } : { kind: 'pending', done: counts.done, total }
  }
  if (total === 0) return { kind: 'none' }
  return failed > 0 ? { kind: 'failed', failed, total } : { kind: 'ready' }
}

/**
 * How one upload shows its state: status icon and text, the bar, a message line and the row tone. The bar fills while
 * the file uploads, stands full until its variants start, runs striped while they are generated and ends full in the
 * tone of the outcome; a waiting or skipped file has none.
 */
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

function full(label: string, valueText: string, tone: ProgressTone = 'default'): ProgressRowProgress {
  return { value: 100, label, valueText, tone }
}

function variantsView(phase: UploadVariantPhase, label: string, canRetry: boolean, t: Translate): UploadStateView | null {
  switch (phase.kind) {
    case 'pending': {
      const counted = phase.total !== undefined && phase.done !== undefined
      const counts = counted ? { done: phase.done, total: phase.total } : undefined
      const text = counts ? t('media.upload.variantsProgress', counts) : t('media.upload.processing')
      const valueText = counts ? t('media.upload.variantsValue', counts) : t('media.upload.processing')
      const progress = phase.generating ? { label, valueText } : full(label, valueText)
      return { tone: 'default', status: { text, busy: true }, progress }
    }
    case 'stalled': {
      const text = t('media.tile.variantsStalledShort')
      return { tone: 'default', status: { text, icon: 'clock', tone: 'muted' }, progress: full(label, text, 'muted'), message: t('media.tile.variantsStalled') }
    }
    case 'failed': {
      const text = t('media.upload.variantsFailedCount', { n: phase.failed, total: phase.total })
      return {
        tone: 'default',
        status: { text, icon: 'triangle-alert', tone: 'warning' },
        progress: full(label, text, 'warning'),
        message: t(canRetry ? 'media.tile.variantsFailedRetry' : 'media.tile.variantsFailedAsk'),
      }
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
      const text = t('media.upload.uploading')
      const progress = item.totalKnown
        ? { value: item.progress, label, valueText: t('media.tile.percent', { percent: item.progress }) }
        : { label, valueText: text }
      return { tone: 'default', status: { text, busy: true }, progress }
    }
    case 'processing':
      return { tone: 'default', status: { text: t('media.tile.processing'), busy: true }, progress: full(label, t('media.tile.processing')) }
    case 'done': {
      const text = t('media.upload.done')
      return { tone: 'default', status: { text, icon: 'circle-check', tone: 'success' }, progress: full(label, text, 'success') }
    }
    case 'failed': {
      const text = t('media.upload.failed')
      return { tone: 'danger', status: { text, icon: 'circle-x', tone: 'danger' }, progress: full(label, text, 'danger'), message: item.message }
    }
    case 'cancelled': {
      const text = t('media.upload.cancelled')
      return { tone: 'muted', status: { text, icon: 'x', tone: 'muted' }, progress: { value: item.progress, label, valueText: text, tone: 'muted' } }
    }
    case 'skipped':
      return { tone: 'muted', status: { text: t('media.upload.wasSkipped'), icon: 'minus', tone: 'muted' }, message: item.message }
  }
}

/** How a whole run shows in the panel header: its status, the upload count, a detail line on variant trouble, the text for the live region and the overall bar. */
export interface UploadRunView {
  /** While files upload, a spinner with the count; then the variant phase, then the outcome. */
  status: ProgressRowStatus
  /** The upload count with its failed, cancelled and skipped parts. */
  countText: string
  /** What the header shows after a finished run's status: the full count while variants are pending or when uploads failed or were cancelled, else only the skipped part. */
  trail?: string
  /** Files whose variants failed or were delayed, once no file's variants are pending. */
  detail?: string
  /** What screen readers hear: the count and the phase, never the per-file variant progress. */
  liveText: string
  /**
   * The overall bar: while any file uploads or waits, the settled files plus the sent share of the running ones in
   * percent of the files to be sent; then full, without a value while any file's variants are generated, and in the
   * tone of the outcome; full as well when every file was skipped.
   */
  bar: { value?: number; tone: ProgressTone }
}

interface VariantTally { files: number; pending: number; generating: number; failed: number; stalled: number }

function tally(phases: readonly UploadVariantPhase[]): VariantTally {
  const counts: VariantTally = { files: 0, pending: 0, generating: 0, failed: 0, stalled: 0 }
  for (const phase of phases) {
    if (phase.kind === 'none') continue
    counts.files++
    if (phase.kind === 'pending') {
      counts.pending++
      if (phase.generating) counts.generating++
    }
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
  const text = t('media.upload.doneCount', { done: summary.done, total: summary.total })
  if (variants.failed) return { text, icon: 'triangle-alert', tone: 'warning' }
  if (variants.stalled) return { text, icon: 'clock', tone: 'muted' }
  return { text, icon: 'circle-check', tone: 'success' }
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

  if (!summary.finished) {
    const sent = items.every((item) => item.status !== 'queued' && item.status !== 'uploading')
    const bar: UploadRunView['bar'] = sent && variants.generating ? { tone: 'default' } : { value: overall, tone: 'default' }
    return { status: { text: countText, busy: true }, countText, liveText: countText, bar }
  }

  const status = finishedStatus(summary, variants, t)
  const trail = variants.pending || failed || cancelled ? countText : skipped ? t('media.upload.countSkipped', { n: skipped }) : undefined
  const detail = variantDetail(variants, t)
  const liveText = variants.pending
    ? `${countText}. ${t('media.upload.processing')}`
    : [status.text, trail, detail].filter(Boolean).join('. ')
  return { status, countText, trail, detail, liveText, bar: finishedBar(summary, variants, overall) }
}

function finishedBar(summary: UploadSummary, variants: VariantTally, sentShare: number): UploadRunView['bar'] {
  const overall = summary.total ? sentShare : 100
  if (variants.pending) return variants.generating ? { tone: 'default' } : { value: overall, tone: 'default' }
  if (summary.failed) return { value: overall, tone: 'danger' }
  if (variants.failed) return { value: overall, tone: 'warning' }
  if (variants.stalled || summary.cancelled) return { value: overall, tone: 'muted' }
  return { value: overall, tone: summary.done === summary.total ? 'success' : 'default' }
}
