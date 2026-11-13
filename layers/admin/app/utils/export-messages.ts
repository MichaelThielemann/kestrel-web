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

const NAMES: Record<keyof StaleStatus['exports'], string> = {
  indexes: 'delivery.indexExportIndexes',
  llmsFull: 'delivery.indexExportLlmsFull',
}

function line(t: Translate, id: keyof StaleStatus['exports'], outcome: ExportOutcome | null, formatTime: (ms: number) => string): ExportLine {
  const name = t(NAMES[id])
  if (outcome === null) return { id, name, tone: 'none', icon: 'info', text: t('delivery.indexExportNone'), error: null }
  const at = formatTime(outcome.at)
  if (outcome.error !== null) return { id, name, tone: 'failed', icon: 'triangle-alert', text: t('delivery.indexExportFailed', { at }), error: outcome.error }
  if (outcome.skipped) return { id, name, tone: 'skipped', icon: 'clock', text: t('delivery.indexExportSkipped', { at }), error: null }
  const key = outcome.entries === 1 ? 'delivery.indexExportWrittenOne' : 'delivery.indexExportWritten'
  return { id, name, tone: 'current', icon: 'check', text: t(key, { at, n: outcome.entries }), error: null }
}

/** One line for the last export of sitemap.xml, robots.txt and llms.txt and one for llms-full.txt: when, how many entries, or why not. */
export function exportLines(t: Translate, exports: StaleStatus['exports'], formatTime: (ms: number) => string): ExportLine[] {
  return [line(t, 'indexes', exports.indexes, formatTime), line(t, 'llmsFull', exports.llmsFull, formatTime)]
}
