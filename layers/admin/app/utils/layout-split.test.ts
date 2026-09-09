import { describe, expect, it } from 'vitest'
import { splitLayoutAfter } from './layout-split'
import type { LayoutNode } from '#kestrel-admin/types/kestrel'

describe('splitLayoutAfter', () => {
  it('splits right after the row containing a target field', () => {
    const layout: LayoutNode[] = [
      { kind: 'row', fields: ['title'], tracks: [1] },
      { kind: 'row', fields: ['slug', 'status'], tracks: [2, 1] },
      { kind: 'row', fields: ['shareImage'], tracks: [1] },
    ]
    const [before, after] = splitLayoutAfter(layout, ['slug', 'status'])
    expect(before).toEqual([layout[0], layout[1]])
    expect(after).toEqual([layout[2]])
  })

  it('keeps a whole group intact when the target field is in one of its rows', () => {
    const layout: LayoutNode[] = [
      { kind: 'row', fields: ['title'], tracks: [1] },
      { kind: 'group', label: 'g', rows: [{ kind: 'row', fields: ['slug'], tracks: [1] }, { kind: 'row', fields: ['status'], tracks: [1] }] },
      { kind: 'row', fields: ['shareImage'], tracks: [1] },
    ]
    const [before, after] = splitLayoutAfter(layout, ['slug', 'status'])
    expect(before).toEqual([layout[0], layout[1]])
    expect(after).toEqual([layout[2]])
  })

  it('puts everything in the first part when no target field is present', () => {
    const layout: LayoutNode[] = [
      { kind: 'row', fields: ['title'], tracks: [1] },
      { kind: 'row', fields: ['shareImage'], tracks: [1] },
    ]
    const [before, after] = splitLayoutAfter(layout, ['slug', 'status'])
    expect(before).toEqual(layout)
    expect(after).toEqual([])
  })

  it('returns two empty arrays for an empty layout', () => {
    expect(splitLayoutAfter([], ['slug'])).toEqual([[], []])
  })
})
