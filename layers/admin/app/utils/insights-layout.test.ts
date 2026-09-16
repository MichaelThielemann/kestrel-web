import { describe, expect, it } from 'vitest'
import type { InsightsManifest } from '#kestrel-admin/types/api'
import manifest from './__fixtures__/insights-manifest.json'
import { buildGraph } from './insights-graph'
import { layoutGraph } from './insights-layout'

const typedManifest = manifest as InsightsManifest

describe('layoutGraph', () => {
  it('yields a distinct, finite position for every node', () => {
    const { nodes, edges } = buildGraph(typedManifest)
    const positions = layoutGraph(nodes, edges)
    expect(positions.size).toBe(nodes.length)
    const seen = new Set<string>()
    for (const node of nodes) {
      const pos = positions.get(node.id)
      expect(pos).toBeDefined()
      expect(Number.isFinite(pos?.x)).toBe(true)
      expect(Number.isFinite(pos?.y)).toBe(true)
      const key = `${pos?.x},${pos?.y}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})
