import type { RevisionSummary } from '#kestrel-admin/types/api'

export const LANE_COLOURS = 6

export interface RevisionArm {
  lane: number
  colour: number
}

export interface RevisionRow {
  revision: RevisionSummary
  lane: number
  colour: number
  branch: number
  head: boolean
  tip: boolean
  fork: boolean
  hasChild: boolean
  hasParent: boolean
  parentLane: number | null
  merges: RevisionArm[]
  through: RevisionArm[]
}

export interface RevisionLayout {
  rows: RevisionRow[]
  lanes: number
  truncated: boolean
}

function firstFreeLane(lanes: (string | null)[]): number {
  const free = lanes.indexOf(null)
  if (free !== -1) return free
  lanes.push(null)
  return lanes.length - 1
}

export function branchColour(branch: number): number {
  return (branch - 1) % LANE_COLOURS
}

export function layoutRevisions(items: readonly RevisionSummary[], head: string | null): RevisionLayout {
  const lanes: (string | null)[] = []
  const laneBranch: number[] = []
  const laneOf = new Map<string, number>()
  const rows: RevisionRow[] = []
  let width = 1
  let branches = 0

  for (const revision of items) {
    const waiting = lanes.flatMap((entry, index) => (entry === revision.id ? [index] : []))
    const lane = waiting[0] ?? firstFreeLane(lanes)
    const merged = waiting.slice(1)
    const merges = merged.map((index) => arm(index, laneBranch))
    for (const index of merged) lanes[index] = null

    if (waiting.length === 0) {
      branches += 1
      laneBranch[lane] = branches
    }
    const branch = laneBranch[lane] ?? 1

    const occupiedBefore = lanes.map((entry) => entry !== null)
    lanes[lane] = revision.parentId
    const through: RevisionArm[] = []
    for (let index = 0; index < lanes.length; index++) {
      if (index === lane || merged.includes(index)) continue
      if (occupiedBefore[index] === true && lanes[index] != null) through.push(arm(index, laneBranch))
    }

    laneOf.set(revision.id, lane)
    width = Math.max(width, lanes.length)
    rows.push({
      revision,
      lane,
      colour: branchColour(branch),
      branch,
      head: revision.id === head,
      tip: waiting.length === 0,
      fork: merges.length > 0,
      hasChild: waiting.length > 0,
      hasParent: revision.parentId !== null,
      parentLane: null,
      merges,
      through,
    })
  }

  for (const row of rows) {
    const parentId = row.revision.parentId
    row.parentLane = parentId === null ? null : laneOf.get(parentId) ?? null
  }

  return { rows, lanes: width, truncated: lanes.some((entry) => entry !== null) }
}

function arm(lane: number, laneBranch: readonly number[]): RevisionArm {
  return { lane, colour: branchColour(laneBranch[lane] ?? 1) }
}
