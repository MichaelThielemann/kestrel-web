import { describe, expect, it } from 'vitest'
import { aliasMapOf, collectAliasedBlocks, findInTree, moveToIndex, stripAliases, updateAliasById, withAliasMap, withLocaleAliasMap } from './block-tree'
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

describe('stripAliases', () => {
  it('removes alias from every block, including nested slots', () => {
    const blocks: BlockRow[] = [
      { ...block('a'), alias: 'Hero teaser' },
      { id: 'p', type: 'container', props: {}, slots: { items: [{ ...block('c1'), alias: 'Nested' }] } },
    ]
    expect(stripAliases(blocks)).toEqual([
      block('a'),
      { id: 'p', type: 'container', props: {}, slots: { items: [block('c1')] } },
    ])
  })

  it('leaves a tree without any alias unchanged in shape', () => {
    const blocks = [block('a'), block('b')]
    expect(stripAliases(blocks)).toEqual(blocks)
  })
})

describe('aliasMapOf', () => {
  it('builds an id-to-alias map from the tree, including nested slots', () => {
    const blocks: BlockRow[] = [
      { ...block('a'), alias: 'Hero teaser' },
      { id: 'p', type: 'container', props: {}, slots: { items: [{ ...block('c1'), alias: 'Nested' }] } },
    ]
    expect(aliasMapOf(blocks)).toEqual({ a: 'Hero teaser', c1: 'Nested' })
  })

  it('returns an empty map when no block has an alias', () => {
    expect(aliasMapOf([block('a'), block('b')])).toEqual({})
  })
})

describe('withAliasMap', () => {
  it('applies each alias in the map to its matching block', () => {
    const blocks = [block('a'), block('b')]
    const result = withAliasMap(blocks, { a: 'Hero teaser', b: 'Second' })
    expect(findInTree(result, 'a')?.block.alias).toBe('Hero teaser')
    expect(findInTree(result, 'b')?.block.alias).toBe('Second')
  })

  it('ignores an id in the map that no block has', () => {
    const blocks = [block('a')]
    expect(withAliasMap(blocks, { missing: 'x' })).toEqual(blocks)
  })
})

describe('withLocaleAliasMap', () => {
  it('sets a locale absent from an undefined field', () => {
    expect(withLocaleAliasMap(undefined, 'de', { b1: 'Startseiten-Teaser' })).toEqual({ de: { b1: 'Startseiten-Teaser' } })
  })

  it('saving de then en keeps both locales, since block ids differ per locale body', () => {
    const afterDe = withLocaleAliasMap(undefined, 'de', { b1: 'Startseiten-Teaser' })
    const afterEn = withLocaleAliasMap(afterDe, 'en', { b2: 'Homepage teaser' })
    expect(afterEn).toEqual({ de: { b1: 'Startseiten-Teaser' }, en: { b2: 'Homepage teaser' } })
  })

  it('replaces only the given locale, leaving every other locale untouched', () => {
    const current = { de: { b1: 'Alt' }, en: { b2: 'Old' } }
    expect(withLocaleAliasMap(current, 'de', { b1: 'Neu' })).toEqual({ de: { b1: 'Neu' }, en: { b2: 'Old' } })
  })
})
