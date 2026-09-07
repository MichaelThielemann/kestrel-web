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
})
