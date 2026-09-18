import { describe, expect, it } from 'vitest'
import { findInTree, moveToIndex } from './block-tree'
import type { BlockRow } from './block-tree'

function block(id: string): BlockRow {
  return { id, type: 'hero', props: {} }
}

describe('moveToIndex', () => {
  it('moves a top-level block to the given index', () => {
    const blocks = [block('a'), block('b'), block('c')]
    expect(moveToIndex(blocks, 'a', 2).map((b) => b.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves a nested block within its own slot, leaving other levels untouched', () => {
    const parent: BlockRow = { id: 'p', type: 'container', props: {}, slots: { items: [block('c1'), block('c2'), block('c3')] } }
    const result = moveToIndex([parent, block('sibling')], 'c1', 2)
    const siblings = findInTree(result, 'c1')?.siblings ?? []
    expect(siblings.map((b) => b.id)).toEqual(['c2', 'c3', 'c1'])
    expect(result.map((b) => b.id)).toEqual(['p', 'sibling'])
  })

  it('clamps an out-of-range target index to the last position', () => {
    const blocks = [block('a'), block('b')]
    expect(moveToIndex(blocks, 'a', 99).map((b) => b.id)).toEqual(['b', 'a'])
  })

  it('clamps a negative target index to the first position', () => {
    const blocks = [block('a'), block('b')]
    expect(moveToIndex(blocks, 'b', -5).map((b) => b.id)).toEqual(['b', 'a'])
  })

  it('returns the tree unchanged for an unknown id', () => {
    const blocks = [block('a'), block('b')]
    expect(moveToIndex(blocks, 'missing', 1)).toEqual(blocks)
  })
})
