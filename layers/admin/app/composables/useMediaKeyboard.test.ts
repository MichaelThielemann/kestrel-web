import { describe, expect, it } from 'vitest'
import { focusSuccessor, verticalTarget } from './useMediaKeyboard'

describe('verticalTarget', () => {
  const cells = ['up', 'folder', null, null, 'f1', 'f2', 'f3', 'f4', 'f5']

  it('moves to the tile in the same column of the next row, counting the cells of uploads', () => {
    expect(verticalTarget(cells, 'folder', 4, 1)).toBe('f2')
    expect(verticalTarget(cells, 'up', 4, 1)).toBe('f1')
    expect(verticalTarget(cells, 'f2', 4, -1)).toBe('folder')
  })

  it('takes the nearest tile of the row when the cell above is an upload', () => {
    expect(verticalTarget(cells, 'f3', 4, -1)).toBe('folder')
    expect(verticalTarget(cells, 'f4', 4, -1)).toBe('folder')
  })

  it('stays put when the next row has no cell in that column, and past the edge', () => {
    expect(verticalTarget(cells, 'f1', 4, 1)).toBe('f5')
    expect(verticalTarget(cells, 'f4', 4, 1)).toBeNull()
    expect(verticalTarget(cells, 'f5', 4, 1)).toBeNull()
    expect(verticalTarget(cells, 'folder', 4, -1)).toBeNull()
  })

  it('moves by one in a single column', () => {
    expect(verticalTarget(['a', 'b', 'c'], 'b', 1, 1)).toBe('c')
    expect(verticalTarget(['a', 'b', 'c'], 'b', 1, -1)).toBe('a')
  })
})

describe('focusSuccessor', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f']

  it('keeps the position when a single item is removed', () => {
    expect(focusSuccessor(before, ['a', 'c', 'd', 'e', 'f'], 'b')).toBe('c')
  })

  it('lands on the first remaining item after the focused one when several items before it are removed', () => {
    expect(focusSuccessor(before, ['a', 'e', 'f'], 'd')).toBe('e')
    expect(focusSuccessor(before, ['a', 'e', 'f'], 'c')).toBe('e')
  })

  it('skips removed items that follow the focused one', () => {
    expect(focusSuccessor(before, ['a', 'b', 'f'], 'c')).toBe('f')
  })

  it('falls back to the nearest remaining item before it when nothing follows', () => {
    expect(focusSuccessor(before, ['a', 'b', 'c'], 'e')).toBe('c')
  })

  it('falls back to the first item when the focused key was not in the previous list', () => {
    expect(focusSuccessor(['a', 'b'], ['x', 'y'], 'z')).toBe('x')
  })

  it('returns null when nothing is left', () => {
    expect(focusSuccessor(before, [], 'b')).toBeNull()
  })
})
