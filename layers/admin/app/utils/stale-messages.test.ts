import { describe, expect, it } from 'vitest'
import type { StaleStatus } from '#kestrel-admin/types/api'
import { de } from '../i18n/de'
import { en } from '../i18n/en'
import { staleAnnouncement, staleCountText, staleLines, staleProgressText } from './stale-messages'
import type { StaleCount } from './stale-messages'

function tFor(catalog: Record<string, string>) {
  return (key: string, params: Record<string, unknown> = {}) =>
    (catalog[key] ?? key).replace(/\{(\w+)\}/g, (match: string, name: string) => (params[name] != null ? String(params[name]) : match))
}

const tEn = tFor(en)
const tDe = tFor(de)

function status(over: Partial<StaleStatus> = {}): StaleStatus {
  return { stale: 0, failed: 0, rendering: 0, unknown: 0, oldestStaleAt: null, abandoned: 0, ...over }
}

describe('staleCountText', () => {
  const expected: Record<StaleCount, { en: [string, string], de: [string, string] }> = {
    waiting: {
      en: ['1 page waits to be re-rendered because content it shows changed.', '2 pages wait to be re-rendered because content they show changed.'],
      de: ['1 Seite wartet auf das Neu-Rendern, weil sich angezeigte Inhalte geändert haben.', '2 Seiten warten auf das Neu-Rendern, weil sich angezeigte Inhalte geändert haben.'],
    },
    failed: {
      en: ['1 page could not be re-rendered.', '2 pages could not be re-rendered.'],
      de: ['1 Seite konnte nicht neu gerendert werden.', '2 Seiten konnten nicht neu gerendert werden.'],
    },
    unknown: {
      en: [
        '1 page was rendered before changes were tracked; it is re-rendered on every change until one render has recorded what it shows.',
        '2 pages were rendered before changes were tracked; they are re-rendered on every change until one render has recorded what they show.',
      ],
      de: [
        '1 Seite wurde vor der Änderungsverfolgung gerendert; jede Änderung rendert sie neu, bis ein Rendern erfasst hat, was sie zeigt.',
        '2 Seiten wurden vor der Änderungsverfolgung gerendert; jede Änderung rendert sie neu, bis ein Rendern erfasst hat, was sie zeigen.',
      ],
    },
    queued: {
      en: ['1 page queued for re-rendering.', '2 pages queued for re-rendering.'],
      de: ['1 Seite zum Neu-Rendern eingereiht.', '2 Seiten zum Neu-Rendern eingereiht.'],
    },
    retried: {
      en: ['1 page queued again.', '2 pages queued again.'],
      de: ['1 Seite erneut eingereiht.', '2 Seiten erneut eingereiht.'],
    },
    dashboardFailed: {
      en: ['1 page could not be re-rendered', '2 pages could not be re-rendered'],
      de: ['1 Seite konnte nicht neu gerendert werden', '2 Seiten konnten nicht neu gerendert werden'],
    },
  }

  const counts: StaleCount[] = ['waiting', 'failed', 'unknown', 'queued', 'retried', 'dashboardFailed']
  for (const count of counts) {
    it(`words the ${count} count for one page and for two, in English and German`, () => {
      const texts = expected[count]
      expect([staleCountText(tEn, count, 1), staleCountText(tEn, count, 2)]).toEqual(texts.en)
      expect([staleCountText(tDe, count, 1), staleCountText(tDe, count, 2)]).toEqual(texts.de)
    })
  }

  it('words the progress of a single page and of several', () => {
    expect(staleProgressText(tEn, { done: 0, total: 1 })).toBe('0 of 1 page re-rendered')
    expect(staleProgressText(tEn, { done: 1, total: 2 })).toBe('1 of 2 pages re-rendered')
    expect(staleProgressText(tDe, { done: 0, total: 1 })).toBe('0 von 1 Seite neu gerendert')
    expect(staleProgressText(tDe, { done: 1, total: 2 })).toBe('1 von 2 Seiten neu gerendert')
  })
})

describe('staleLines', () => {
  it('lists the waiting, failed and untracked counts, each with its icon', () => {
    expect(staleLines(tEn, status({ stale: 1, failed: 2, unknown: 1 }))).toEqual([
      { tone: 'waiting', icon: 'clock', text: staleCountText(tEn, 'waiting', 1) },
      { tone: 'failed', icon: 'triangle-alert', text: staleCountText(tEn, 'failed', 2) },
      { tone: 'unknown', icon: 'info', text: staleCountText(tEn, 'unknown', 1) },
    ])
  })

  it('says every page is current when nothing waits, failed or is untracked', () => {
    expect(staleLines(tEn, status())).toEqual([{ tone: 'current', icon: 'check', text: en['delivery.upToDate'] }])
  })
})

describe('staleAnnouncement', () => {
  it('announces nothing for the first load', () => {
    expect(staleAnnouncement(tEn, null, status({ stale: 3, failed: 1 }))).toBeNull()
  })

  it('announces when pages start waiting, and nothing while the backlog only shrinks or grows', () => {
    expect(staleAnnouncement(tEn, status(), status({ stale: 5 }))).toBe(staleCountText(tEn, 'waiting', 5))
    expect(staleAnnouncement(tEn, status({ stale: 5 }), status({ stale: 4 }))).toBeNull()
    expect(staleAnnouncement(tEn, status({ stale: 4 }), status({ stale: 9 }))).toBeNull()
    expect(staleAnnouncement(tEn, status({ stale: 4 }), status({ stale: 4 }))).toBeNull()
  })

  it('announces the end of the backlog as current, or as the failures that remain', () => {
    expect(staleAnnouncement(tEn, status({ stale: 1 }), status())).toBe(en['delivery.upToDate'])
    expect(staleAnnouncement(tEn, status({ stale: 1, failed: 1 }), status({ failed: 1 }))).toBe(staleCountText(tEn, 'failed', 1))
  })

  it('announces a new failure while pages still wait', () => {
    expect(staleAnnouncement(tEn, status({ stale: 6 }), status({ stale: 4, failed: 1 }))).toBe(staleCountText(tEn, 'failed', 1))
    expect(staleAnnouncement(tEn, status({ stale: 4, failed: 1 }), status({ stale: 3, failed: 1 }))).toBeNull()
  })
})
