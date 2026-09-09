import { describe, expect, it } from 'vitest'
import { groupBlockTypes, updateRecentList } from './block-picker-groups'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'

const hero: SerializedBlock = { name: 'hero', fields: {} }
const prose: SerializedBlock = { name: 'prose', fields: {} }
const columns: SerializedBlock = { name: 'boxed-container', fields: {} }
const types = [hero, prose, columns]

describe('groupBlockTypes', () => {
  it('returns only the "all" group when there are no favorites or recent picks', () => {
    expect(groupBlockTypes(types, [], [])).toEqual([{ kind: 'all', types }])
  })

  it('adds a favorites group, in favorites order, ahead of "all"', () => {
    expect(groupBlockTypes(types, ['prose', 'hero'], [])).toEqual([
      { kind: 'favorites', types: [prose, hero] },
      { kind: 'all', types },
    ])
  })

  it('adds a recent group, in recent order, ahead of "all"', () => {
    expect(groupBlockTypes(types, [], ['hero', 'boxed-container'])).toEqual([
      { kind: 'recent', types: [hero, columns] },
      { kind: 'all', types },
    ])
  })

  it('orders favorites before recent before all when both are present', () => {
    expect(groupBlockTypes(types, ['hero'], ['prose'])).toEqual([
      { kind: 'favorites', types: [hero] },
      { kind: 'recent', types: [prose] },
      { kind: 'all', types },
    ])
  })

  it('drops a favorite or recent name that no longer matches a known type', () => {
    expect(groupBlockTypes(types, ['hero', 'deleted-block'], ['deleted-block'])).toEqual([
      { kind: 'favorites', types: [hero] },
      { kind: 'all', types },
    ])
  })
})

describe('updateRecentList', () => {
  it('prepends a newly picked name', () => {
    expect(updateRecentList([], 'hero')).toEqual(['hero'])
    expect(updateRecentList(['prose'], 'hero')).toEqual(['hero', 'prose'])
  })

  it('moves an already-present name to the front instead of duplicating it', () => {
    expect(updateRecentList(['prose', 'hero', 'columns'], 'hero')).toEqual(['hero', 'prose', 'columns'])
  })

  it('caps the list at the given size, dropping the oldest entries', () => {
    expect(updateRecentList(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
  })

  it('defaults the cap to 6', () => {
    expect(updateRecentList(['a', 'b', 'c', 'd', 'e', 'f'], 'g')).toEqual(['g', 'a', 'b', 'c', 'd', 'e'])
  })
})
