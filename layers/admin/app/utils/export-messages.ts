import type { StaleStatus } from '#kestrel-admin/types/api'
import type { IconName } from './icons'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The recorded outcome of one of delivery-static's index exports. */
export type ExportOutcome = NonNullable<StaleStatus['exports']['indexes']>

export interface ExportLine {
  id: keyof StaleStatus['exports']
  name: string
  tone: 'current' | 'failed' | 'skipped' | 'none'
  icon: IconName
  text: string
  error: string | null
}

/** Which index files the site writes, from the admin schema. */
export interface IndexFiles {
  sitemap: boolean
  robots: boolean
  llmsFull: boolean
}

/** How times and lists of file names read in the admin's language. */
export interface ExportFormat {
  time: (ms: number) => string
  list: (items: readonly string[]) => string
}

function skippedText(t: Translate, at: string, kept: readonly string[], format: ExportFormat): string {
  return kept.length === 1
    ? t('delivery.exportSkippedOne', { at, file: kept[0] })
    : t('delivery.exportSkippedMany', { at, files: format.list(kept) })
}

function line(t: Translate, id: keyof StaleStatus['exports'], name: string, outcome: ExportOutcome | null, format: ExportFormat, skipped: (at: string) => string): ExportLine {
  if (outcome === null) return { id, name, tone: 'none', icon: 'info', text: t('delivery.indexExportNone'), error: null }
  const at = format.time(outcome.at)
  if (outcome.error !== null) return { id, name, tone: 'failed', icon: 'triangle-alert', text: t('delivery.indexExportFailed', { at }), error: outcome.error }
  if (outcome.skipped) return { id, name, tone: 'skipped', icon: 'clock', text: skipped(at), error: null }
  const key = outcome.entries === 1 ? 'delivery.indexExportWrittenOne' : 'delivery.indexExportWritten'
  return { id, name, tone: 'current', icon: 'check', text: t(key, { at, n: outcome.entries }), error: null }
}

/**
 * One line for the last export of the index files the site writes (sitemap.xml, robots.txt, llms.txt) and, while
 * `files.llmsFull` says the site writes it, one for llms-full.txt: when, how many entries, or why not. A skipped
 * index export keeps sitemap.xml and llms.txt and still writes robots.txt.
 */
export function exportLines(t: Translate, exports: StaleStatus['exports'], format: ExportFormat, files: IndexFiles): ExportLine[] {
  const kept = [...(files.sitemap ? ['sitemap.xml'] : []), 'llms.txt']
  const written = [...(files.sitemap ? ['sitemap.xml'] : []), ...(files.robots ? ['robots.txt'] : []), 'llms.txt']
  const indexes = line(t, 'indexes', format.list(written), exports.indexes, format, (at) => {
    const text = skippedText(t, at, kept, format)
    return files.robots ? `${text} ${t('delivery.indexExportRobotsWritten')}` : text
  })
  if (!files.llmsFull) return [indexes]
  const llmsFull = line(t, 'llmsFull', 'llms-full.txt', exports.llmsFull, format, (at) => skippedText(t, at, ['llms-full.txt'], format))
  return [indexes, llmsFull]
}
