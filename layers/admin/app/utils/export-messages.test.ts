import { describe, expect, it } from 'vitest'
import type { StaleStatus } from '#kestrel-admin/types/api'
import { de } from '../i18n/de'
import { en } from '../i18n/en'
import { exportLines } from './export-messages'

function tFor(catalog: Record<string, string>) {
  return (key: string, params: Record<string, unknown> = {}) =>
    (catalog[key] ?? key).replace(/\{(\w+)\}/g, (match: string, name: string) => (params[name] != null ? String(params[name]) : match))
}

const at = (ms: number) => `<${ms}>`

function exports(over: Partial<StaleStatus['exports']> = {}): StaleStatus['exports'] {
  return { indexes: null, llmsFull: null, ...over }
}

describe('exportLines', () => {
  it('gives one line for the index files and one for llms-full.txt, each saying no export was recorded yet', () => {
    expect(exportLines(tFor(en), exports(), at)).toEqual([
      { id: 'indexes', name: 'sitemap.xml, robots.txt and llms.txt', tone: 'none', icon: 'info', text: 'No export recorded yet.', error: null },
      { id: 'llmsFull', name: 'llms-full.txt', tone: 'none', icon: 'info', text: 'No export recorded yet.', error: null },
    ])
  })

  it('words a written export with its time and entries, in the singular for one entry', () => {
    const lines = exportLines(tFor(en), exports({ indexes: { at: 5, entries: 12, error: null, skipped: false }, llmsFull: { at: 7, entries: 1, error: null, skipped: false } }), at)
    expect(lines.map((line) => [line.tone, line.icon, line.text, line.error])).toEqual([
      ['current', 'check', 'Exported at <5>, 12 entries.', null],
      ['current', 'check', 'Exported at <7>, 1 entry.', null],
    ])
  })

  it('words a failed export with its time and keeps the error apart', () => {
    const [line] = exportLines(tFor(en), exports({ indexes: { at: 9, entries: 0, error: 'blobstore unavailable', skipped: false } }), at)
    expect(line).toMatchObject({ tone: 'failed', icon: 'triangle-alert', text: 'Export failed at <9>:', error: 'blobstore unavailable' })
  })

  it('words a skipped export with its time and why the files were kept', () => {
    const [line] = exportLines(tFor(en), exports({ indexes: { at: 3, entries: 0, error: null, skipped: true } }), at)
    expect(line).toMatchObject({ tone: 'skipped', icon: 'clock', text: 'Skipped at <3>: published pages have no rendered output yet, so the files were left as they are.', error: null })
  })

  it('has every sentence in German', () => {
    const lines = exportLines(tFor(de), exports({
      indexes: { at: 1, entries: 2, error: null, skipped: false },
      llmsFull: { at: 4, entries: 0, error: 'kaputt', skipped: false },
    }), at)
    expect(lines.map((line) => [line.name, line.text])).toEqual([
      ['sitemap.xml, robots.txt und llms.txt', 'Exportiert am <1>, 2 Einträge.'],
      ['llms-full.txt', 'Export am <4> fehlgeschlagen:'],
    ])
    expect(exportLines(tFor(de), exports({ indexes: { at: 1, entries: 1, error: null, skipped: false } }), at)[0]?.text).toBe('Exportiert am <1>, 1 Eintrag.')
    expect(exportLines(tFor(de), exports({ indexes: { at: 1, entries: 0, error: null, skipped: true } }), at)[0]?.text).toBe('Am <1> übersprungen: Veröffentlichte Seiten haben noch keine gerenderte Ausgabe, die Dateien bleiben unverändert.')
    expect(exportLines(tFor(de), exports(), at)[0]?.text).toBe('Noch kein Export aufgezeichnet.')
  })
})
