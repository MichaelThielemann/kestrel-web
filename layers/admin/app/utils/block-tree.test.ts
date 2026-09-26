import { describe, expect, it } from 'vitest'
import { collectAliasedBlocks, findInTree, moveToIndex, updateAliasById } from './block-tree'
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

describe('updateAliasById', () => {
  it('sets a trimmed alias on the matching block', () => {
    const blocks = [block('a')]
    expect(findInTree(updateAliasById(blocks, 'a', '  Intro teaser  '), 'a')?.block.alias).toBe('Intro teaser')
  })

  it('removes the alias when set to an empty string', () => {
    const blocks = [{ ...block('a'), alias: 'Intro teaser' }]
    expect(findInTree(updateAliasById(blocks, 'a', '   '), 'a')?.block.alias).toBeUndefined()
  })

  it('sets the alias on a block nested in a slot', () => {
    const parent: BlockRow = { id: 'p', type: 'container', props: {}, slots: { items: [block('c1')] } }
    const result = updateAliasById([parent], 'c1', 'Nested block')
    expect(findInTree(result, 'c1')?.block.alias).toBe('Nested block')
  })
})

describe('collectAliasedBlocks', () => {
  it('collects only blocks that carry an alias', () => {
    const blocks = [{ ...block('a'), alias: 'Hero teaser' }, block('b')]
    expect(collectAliasedBlocks(blocks)).toEqual([{ id: 'a', alias: 'Hero teaser', type: 'hero' }])
  })

  it('walks into slots to find aliased descendants', () => {
    const parent: BlockRow = { id: 'p', type: 'container', props: {}, slots: { items: [{ ...block('c1'), alias: 'Nested' }] } }
    expect(collectAliasedBlocks([parent])).toEqual([{ id: 'c1', alias: 'Nested', type: 'hero' }])
  })

  it('returns an empty array when no block has an alias', () => {
    expect(collectAliasedBlocks([block('a'), block('b')])).toEqual([])
  })
})
