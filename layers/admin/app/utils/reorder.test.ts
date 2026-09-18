import { describe, expect, it } from 'vitest'
import { dropGapIndex, reorder, reorderTargetIndex } from './reorder'
import type { RowRect } from './reorder'

describe('reorder', () => {
  it('moves an item from one index to another', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item to the end', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('returns a copy unchanged when from equals to', () => {
    expect(reorder(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })

  it('returns a copy unchanged for an out-of-range index', () => {
    expect(reorder(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(reorder(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
  })
})

describe('dropGapIndex', () => {
  const rects: RowRect[] = [
    { top: 0, height: 40 },
    { top: 40, height: 40 },
    { top: 80, height: 40 },
  ]

  it('returns 0 above the first row midpoint', () => {
    expect(dropGapIndex(rects, 5)).toBe(0)
  })

  it('returns the gap between two rows once the pointer passes a midpoint', () => {
    expect(dropGapIndex(rects, 30)).toBe(1)
    expect(dropGapIndex(rects, 70)).toBe(2)
  })

  it('returns the row count once the pointer passes every midpoint', () => {
    expect(dropGapIndex(rects, 200)).toBe(3)
  })

  it('returns 0 for an empty list', () => {
    expect(dropGapIndex([], 100)).toBe(0)
  })
})

describe('reorderTargetIndex', () => {
  it('keeps the gap index when it sits at or before the source', () => {
    expect(reorderTargetIndex(0, 2)).toBe(0)
    expect(reorderTargetIndex(2, 2)).toBe(2)
  })

  it('shifts the gap index back by one once it sits after the source', () => {
    expect(reorderTargetIndex(3, 0)).toBe(2)
    expect(reorderTargetIndex(1, 0)).toBe(0)
  })
})
