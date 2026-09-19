import type { RevisionSummary } from '#kestrel-admin/types/api'
import { describe, expect, it } from 'vitest'
import { layoutRevisions } from './revision-lanes'

function revision(id: string, parentId: string | null, extra: Partial<RevisionSummary> = {}): RevisionSummary {
  return {
    id,
    collection: 'pages',
    documentId: 'p1',
    locale: 'de',
    parentId,
    createdAt: 0,
    author: { id: 'u1', name: 'admin' },
    kind: 'save',
    label: null,
    status: 'draft',
    live: false,
    bytes: 100,
    skipped: false,
    ...extra,
  }
}

const laneOf = (rows: { revision: RevisionSummary, lane: number }[], id: string): number | undefined =>
  rows.find((row) => row.revision.id === id)?.lane

describe('layoutRevisions', () => {
  it('puts a linear history on one lane', () => {
    const items = [revision('c', 'b'), revision('b', 'a'), revision('a', null)]
    const layout = layoutRevisions(items, 'c')

    expect(layout.lanes).toBe(1)
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 0, 0])
    expect(layout.rows.map((row) => row.branch)).toEqual([1, 1, 1])
    expect(layout.truncated).toBe(false)
  })

  it('marks the head, the tip of a branch and the parents each row draws to', () => {
    const items = [revision('c', 'b'), revision('b', 'a'), revision('a', null)]
    const rows = layoutRevisions(items, 'b').rows

    expect(rows.map((row) => row.head)).toEqual([false, true, false])
    expect(rows.map((row) => row.tip)).toEqual([true, false, false])
    expect(rows.map((row) => row.hasParent)).toEqual([true, true, false])
    expect(rows.map((row) => row.hasChild)).toEqual([false, true, true])
    expect(rows.map((row) => row.parentLane)).toEqual([0, 0, null])
  })

  it('forks a second lane when two revisions share a parent and merges it at the fork point', () => {
    const items = [revision('d', 'a'), revision('c', 'b'), revision('b', 'a'), revision('a', null)]
    const layout = layoutRevisions(items, 'd')

    expect(layout.lanes).toBe(2)
    expect(laneOf(layout.rows, 'd')).toBe(0)
    expect(laneOf(layout.rows, 'c')).toBe(1)
    expect(laneOf(layout.rows, 'b')).toBe(1)
    expect(laneOf(layout.rows, 'a')).toBe(0)

    const fork = layout.rows.find((row) => row.revision.id === 'a')
    expect(fork?.fork).toBe(true)
    expect(fork?.merges).toEqual([1])
    expect(layout.rows.find((row) => row.revision.id === 'b')?.parentLane).toBe(0)
  })

  it('keeps three branches on three lanes and gives each its own colour', () => {
    const items = [revision('e', 'a'), revision('d', 'a'), revision('c', 'b'), revision('b', 'a'), revision('a', null)]
    const layout = layoutRevisions(items, 'e')

    expect(layout.lanes).toBe(3)
    expect([laneOf(layout.rows, 'e'), laneOf(layout.rows, 'd'), laneOf(layout.rows, 'c')]).toEqual([0, 1, 2])
    expect(layout.rows.find((row) => row.revision.id === 'a')?.merges).toEqual([1, 2])
    expect(layout.rows.map((row) => row.colour)).toEqual(layout.rows.map((row) => row.lane % 6))
  })

  it('draws a lane straight through a row that belongs to another branch', () => {
    const items = [revision('d', 'a'), revision('c', 'b'), revision('b', 'a'), revision('a', null)]
    const rows = layoutRevisions(items, 'd').rows

    expect(rows.find((row) => row.revision.id === 'c')?.through).toEqual([0])
    expect(rows.find((row) => row.revision.id === 'b')?.through).toEqual([0])
    expect(rows.find((row) => row.revision.id === 'a')?.through).toEqual([])
  })

  it('reports a truncated page when the oldest row still points at a parent that is not loaded', () => {
    const page = layoutRevisions([revision('c', 'b'), revision('b', 'a')], 'c')

    expect(page.truncated).toBe(true)
    expect(page.rows.find((row) => row.revision.id === 'b')?.parentLane).toBe(null)
  })

  it('places a re-parented survivor of a prune without leaving a gap', () => {
    const items = [revision('d', 'a'), revision('c', 'a'), revision('a', null)]
    const layout = layoutRevisions(items, 'd')

    expect(layout.truncated).toBe(false)
    expect(layout.lanes).toBe(2)
    expect(layout.rows.find((row) => row.revision.id === 'a')?.merges).toEqual([1])
  })

  it('reads an empty history as a single empty lane', () => {
    expect(layoutRevisions([], null)).toEqual({ rows: [], lanes: 1, truncated: false })
  })
})
