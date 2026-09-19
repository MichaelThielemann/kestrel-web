import { describe, expect, it } from 'vitest'
import { countRevisionBlocks, diffRevision } from './revision-diff'

const KEYS = ['title', 'slug', 'status', 'body']

describe('countRevisionBlocks', () => {
  it('counts nested blocks by type', () => {
    const blocks = [
      { id: '1', type: 'hero' },
      { id: '2', type: 'section', slots: { default: [{ id: '3', type: 'text' }, { id: '4', type: 'text' }] } },
    ]
    expect(countRevisionBlocks(blocks)).toEqual({ total: 4, byType: { hero: 1, section: 1, text: 2 } })
  })
})

describe('diffRevision', () => {
  it('names the top-level fields that differ', () => {
    const diff = diffRevision({ title: 'Old', slug: 'a', status: 'draft' }, { title: 'New', slug: 'a', status: 'draft', body: [] }, KEYS, 'body')
    expect(diff.fields).toEqual(['title'])
    expect(diff.equal).toBe(false)
  })

  it('treats null, undefined and an empty string as the same absence', () => {
    const diff = diffRevision({ title: 'T', slug: null }, { title: 'T', slug: '', status: undefined, body: [] }, KEYS, 'body')
    expect(diff.fields).toEqual([])
    expect(diff.equal).toBe(true)
  })

  it('ignores key order inside an object field', () => {
    const diff = diffRevision({ title: { a: 1, b: 2 } }, { title: { b: 2, a: 1 } }, ['title'], 'body')
    expect(diff.fields).toEqual([])
  })

  it('reports the block count and the types whose count changed', () => {
    const snapshot = { body: [{ id: '1', type: 'hero' }, { id: '2', type: 'text' }] }
    const current = { body: [{ id: '1', type: 'hero' }, { id: '3', type: 'gallery' }, { id: '4', type: 'gallery' }] }
    const diff = diffRevision(snapshot, current, KEYS, 'body')

    expect(diff.blocksBefore).toBe(2)
    expect(diff.blocksAfter).toBe(3)
    expect(diff.blocks).toEqual([{ type: 'gallery', before: 0, after: 2 }, { type: 'text', before: 1, after: 0 }])
  })

  it('leaves the blocks field out of the field list', () => {
    const diff = diffRevision({ body: [{ id: '1', type: 'hero' }] }, { body: [] }, KEYS, 'body')
    expect(diff.fields).toEqual([])
    expect(diff.equal).toBe(false)
  })

  it('reads a revision without a snapshot as fully different from a filled editor', () => {
    const diff = diffRevision(null, { title: 'T', body: [{ id: '1', type: 'hero' }] }, KEYS, 'body')
    expect(diff.fields).toEqual(['title'])
    expect(diff.blocksAfter).toBe(1)
  })
})
