import { describe, expect, it } from 'vitest'
import type { StaleStatus } from '#kestrel-admin/types/api'
import { de } from '../i18n/de'
import { en } from '../i18n/en'
import { exportAnnouncement, exportLines, exportsRecordedSince } from './export-messages'

function tFor(catalog: Record<string, string>) {
  return (key: string, params: Record<string, unknown> = {}) =>
    (catalog[key] ?? key).replace(/\{(\w+)\}/g, (match: string, name: string) => (params[name] != null ? String(params[name]) : match))
}

const format = { time: (ms: number) => `<${ms}>`, list: (items: readonly string[]) => items.join(' + ') }
const all = { sitemap: true, robots: true, llmsFull: true }
const noLlmsFull = { ...all, llmsFull: false }

function exports(over: Partial<StaleStatus['exports']> = {}): StaleStatus['exports'] {
  return { indexes: null, llmsFull: null, ...over }
}

describe('exportLines', () => {
  it('leaves llms-full.txt out while llms.full is off, whatever its last recorded outcome says', () => {
    const lines = exportLines(tFor(en), exports({ indexes: { at: 5, entries: 2, error: null, skipped: false }, llmsFull: { at: 1, entries: 0, error: 'blobstore unavailable', skipped: false } }), format, noLlmsFull)
    expect(lines.map((line) => line.id)).toEqual(['indexes'])
  })

  it('gives one line for the index files and one for llms-full.txt, each saying no export was recorded yet', () => {
    expect(exportLines(tFor(en), exports(), format, all)).toEqual([
      { id: 'indexes', name: 'sitemap.xml + robots.txt + llms.txt', tone: 'none', icon: 'info', text: 'No export recorded yet.', error: null },
      { id: 'llmsFull', name: 'llms-full.txt', tone: 'none', icon: 'info', text: 'No export recorded yet.', error: null },
    ])
  })

  it('words a written export with its time and entries, in the singular for one entry', () => {
    const lines = exportLines(tFor(en), exports({ indexes: { at: 5, entries: 12, error: null, skipped: false }, llmsFull: { at: 7, entries: 1, error: null, skipped: false } }), format, all)
    expect(lines.map((line) => [line.tone, line.icon, line.text, line.error])).toEqual([
      ['current', 'check', 'Exported at <5>, 12 entries.', null],
      ['current', 'check', 'Exported at <7>, 1 entry.', null],
    ])
  })

  it('words a failed export with its time and keeps the error apart', () => {
    const [line] = exportLines(tFor(en), exports({ indexes: { at: 9, entries: 0, error: 'blobstore unavailable', skipped: false } }), format, all)
    expect(line).toMatchObject({ tone: 'failed', icon: 'triangle-alert', text: 'Export failed at <9>:', error: 'blobstore unavailable' })
  })

  it('words a skipped export with its time and which files were kept: robots.txt is written on a skip, llms-full.txt is not', () => {
    const [indexes, llmsFull] = exportLines(tFor(en), exports({ indexes: { at: 3, entries: 0, error: null, skipped: true }, llmsFull: { at: 4, entries: 0, error: null, skipped: true } }), format, all)
    expect(indexes).toMatchObject({ tone: 'skipped', icon: 'clock', text: 'Skipped at <3>: published pages have no rendered output yet, so sitemap.xml + llms.txt were left as they are. robots.txt was written.', error: null })
    expect(llmsFull).toMatchObject({ tone: 'skipped', icon: 'clock', text: 'Skipped at <4>: published pages have no rendered output yet, so llms-full.txt was left as it is.', error: null })
  })

  it('names only the index files the site writes and claims no robots.txt on a skip while robots is off', () => {
    const files = { sitemap: false, robots: false, llmsFull: false }
    const [line] = exportLines(tFor(en), exports({ indexes: { at: 3, entries: 0, error: null, skipped: true } }), format, files)
    expect(line).toMatchObject({ name: 'llms.txt', text: 'Skipped at <3>: published pages have no rendered output yet, so llms.txt was left as it is.' })
    const [robotsOff] = exportLines(tFor(en), exports({ indexes: { at: 3, entries: 0, error: null, skipped: true } }), format, { ...files, sitemap: true })
    expect(robotsOff).toMatchObject({ name: 'sitemap.xml + llms.txt', text: 'Skipped at <3>: published pages have no rendered output yet, so sitemap.xml + llms.txt were left as they are.' })
    const [noSitemap] = exportLines(tFor(en), exports({ indexes: { at: 3, entries: 0, error: null, skipped: true } }), format, { ...files, robots: true })
    expect(noSitemap).toMatchObject({ name: 'robots.txt + llms.txt', text: 'Skipped at <3>: published pages have no rendered output yet, so llms.txt was left as it is. robots.txt was written.' })
  })

  it('has every sentence in German', () => {
    const lines = exportLines(tFor(de), exports({
      indexes: { at: 1, entries: 2, error: null, skipped: false },
      llmsFull: { at: 4, entries: 0, error: 'kaputt', skipped: false },
    }), format, all)
    expect(lines.map((line) => [line.name, line.text])).toEqual([
      ['sitemap.xml + robots.txt + llms.txt', 'Exportiert am <1>, 2 Einträge.'],
      ['llms-full.txt', 'Export am <4> fehlgeschlagen:'],
    ])
    expect(exportLines(tFor(de), exports({ indexes: { at: 1, entries: 1, error: null, skipped: false } }), format, all)[0]?.text).toBe('Exportiert am <1>, 1 Eintrag.')
    const skipped = exportLines(tFor(de), exports({ indexes: { at: 1, entries: 0, error: null, skipped: true }, llmsFull: { at: 2, entries: 0, error: null, skipped: true } }), format, all)
    expect(skipped.map((line) => line.text)).toEqual([
      'Am <1> übersprungen: Veröffentlichte Seiten haben noch keine gerenderte Ausgabe, sitemap.xml + llms.txt bleiben unverändert. robots.txt wurde geschrieben.',
      'Am <2> übersprungen: Veröffentlichte Seiten haben noch keine gerenderte Ausgabe, llms-full.txt bleibt unverändert.',
    ])
    expect(exportLines(tFor(de), exports(), format, all)[0]?.text).toBe('Noch kein Export aufgezeichnet.')
  })
})

describe('exportAnnouncement', () => {
  const ok = (at: number) => ({ at, entries: 2, error: null, skipped: false })

  it('reads out an export recorded since the last load that failed or was skipped, in the row\'s words', () => {
    const next = exports({ indexes: { at: 9, entries: 0, error: 'EACCES: sitemap.xml', skipped: false }, llmsFull: { at: 9, entries: 0, error: null, skipped: true } })
    expect(exportAnnouncement(tFor(en), exports({ indexes: ok(1), llmsFull: ok(1) }), next, format, all)).toBe(
      'sitemap.xml + robots.txt + llms.txt: Export failed at <9>: EACCES: sitemap.xml llms-full.txt: Skipped at <9>: published pages have no rendered output yet, so llms-full.txt was left as it is.',
    )
  })

  it('stays quiet on the first load, for an outcome it already read out, for a written export and for llms-full.txt while llms.full is off', () => {
    const failed = exports({ indexes: { at: 9, entries: 0, error: 'EACCES', skipped: false }, llmsFull: { at: 9, entries: 0, error: 'EACCES', skipped: false } })
    expect(exportAnnouncement(tFor(en), null, failed, format, all)).toBeNull()
    expect(exportAnnouncement(tFor(en), failed, failed, format, all)).toBeNull()
    expect(exportAnnouncement(tFor(en), exports(), exports({ indexes: ok(3), llmsFull: ok(3) }), format, all)).toBeNull()
    expect(exportAnnouncement(tFor(en), exports({ indexes: failed.indexes }), failed, format, noLlmsFull)).toBeNull()
  })

  it('stays quiet for a newer failure with the same error or a newer skip, and reads out a changed error or a switch between failed and skipped', () => {
    const failedAt = (at: number, error = 'EACCES: llms-full.txt') => exports({ llmsFull: { at, entries: 0, error, skipped: false } })
    const skippedAt = (at: number) => exports({ llmsFull: { at, entries: 0, error: null, skipped: true } })
    expect(exportAnnouncement(tFor(en), failedAt(1), failedAt(2), format, all)).toBeNull()
    expect(exportAnnouncement(tFor(en), skippedAt(1), skippedAt(2), format, all)).toBeNull()
    expect(exportAnnouncement(tFor(en), failedAt(1), failedAt(2, 'ENOSPC: llms-full.txt'), format, all)).toBe('llms-full.txt: Export failed at <2>: ENOSPC: llms-full.txt')
    expect(exportAnnouncement(tFor(en), failedAt(1), skippedAt(2), format, all)).toMatch(/^llms-full\.txt: Skipped at <2>/)
    expect(exportAnnouncement(tFor(en), skippedAt(1), failedAt(2), format, all)).toBe('llms-full.txt: Export failed at <2>: EACCES: llms-full.txt')
    expect(exportAnnouncement(tFor(en), exports({ llmsFull: ok(1) }), failedAt(2), format, all)).toBe('llms-full.txt: Export failed at <2>: EACCES: llms-full.txt')
  })

  it('reads out the first outcome recorded since a wait began even when it repeats the failure or skip before it, and stays quiet for later repeats in that wait', () => {
    const failedAt = (at: number) => exports({ indexes: ok(1), llmsFull: { at, entries: 0, error: 'EACCES: llms-full.txt', skipped: false } })
    const skippedAt = (at: number) => exports({ indexes: ok(1), llmsFull: { at, entries: 0, error: null, skipped: true } })
    expect(exportAnnouncement(tFor(en), failedAt(1), failedAt(9), format, all, failedAt(1))).toBe('llms-full.txt: Export failed at <9>: EACCES: llms-full.txt')
    expect(exportAnnouncement(tFor(en), skippedAt(1), skippedAt(9), format, all, skippedAt(1))).toMatch(/^llms-full\.txt: Skipped at <9>/)
    expect(exportAnnouncement(tFor(en), failedAt(9), failedAt(11), format, all, failedAt(1))).toBeNull()
    expect(exportAnnouncement(tFor(en), failedAt(1), failedAt(1), format, all, failedAt(1))).toBeNull()
    expect(exportAnnouncement(tFor(en), null, failedAt(9), format, all, failedAt(1))).toBeNull()
  })
})

describe('exportsRecordedSince', () => {
  const ok = (at: number) => ({ at, entries: 2, error: null, skipped: false })

  it('waits for each named export to record an outcome later than the one it started from', () => {
    const since = exports({ indexes: ok(1), llmsFull: ok(1) })
    expect(exportsRecordedSince(since, exports({ indexes: ok(4), llmsFull: ok(1) }), ['indexes', 'llmsFull'])).toBe(false)
    expect(exportsRecordedSince(since, exports({ indexes: ok(4), llmsFull: { at: 8, entries: 0, error: 'EACCES', skipped: false } }), ['indexes', 'llmsFull'])).toBe(true)
    expect(exportsRecordedSince(since, exports({ indexes: ok(4), llmsFull: ok(1) }), ['indexes'])).toBe(true)
    expect(exportsRecordedSince(since, exports({ indexes: ok(1), llmsFull: ok(5) }), ['llmsFull'])).toBe(true)
    expect(exportsRecordedSince(exports(), exports({ indexes: ok(4) }), ['indexes'])).toBe(true)
    expect(exportsRecordedSince(exports(), exports(), ['indexes'])).toBe(false)
  })
})
