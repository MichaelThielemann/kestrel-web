import { describe, it, expect } from 'vitest'
import { buildDeleteReport } from './collection-ops'

describe('buildDeleteReport self references', () => {
  it('ignores references from documents that are part of the deletion', () => {
    const refs = new Map([
      ['a', [{ type: 'pages', id: 'a', field: 'body' }, { type: 'pages', id: 'b', field: 'body' }, { type: 'pages', id: 'z', field: 'body' }]],
      ['b', [{ type: 'media', id: 'a', field: 'image' }]],
    ])
    const report = buildDeleteReport(['a', 'b'], refs, true, 'pages')
    expect(report.referenced).toEqual([{ id: 'a', referrers: 1 }, { id: 'b', referrers: 1 }])
    expect(report.references).toEqual([{ type: 'pages', id: 'z', field: 'body' }, { type: 'media', id: 'a', field: 'image' }])
  })

  it('keeps every reference when no collection is given', () => {
    const refs = new Map([['a', [{ type: 'pages', id: 'a', field: 'body' }]]])
    expect(buildDeleteReport(['a'], refs, true).referencedCount).toBe(1)
  })

  it('skips the reference check for a collection without a referrers route', () => {
    const report = buildDeleteReport(['a'], new Map(), false, 'news', false)
    expect(report).toMatchObject({ checked: false, verifiable: false })
  })

  it('reports unverified references when the referrers route fails', () => {
    const report = buildDeleteReport(['a'], new Map(), false, 'pages', true)
    expect(report).toMatchObject({ checked: false, verifiable: true })
  })
})
