import { describe, expect, it } from 'vitest'
import type { InsightsManifest, InsightsPipelineStep  } from '#kestrel-admin/types/api'
import { boundaryCast } from '#kestrel/cast'
import manifest from './__fixtures__/insights-manifest.json'
import { buildGraph, stepSegments } from './insights-graph'

const typedManifest = boundaryCast<InsightsManifest>(manifest, 'json')

describe('buildGraph', () => {
  it('creates one node per module plus one per present trigger kind', () => {
    const { nodes } = buildGraph(typedManifest)
    const moduleNodes = nodes.filter((n) => n.kind === 'module')
    const triggerNodes = nodes.filter((n) => n.kind === 'trigger')
    expect(moduleNodes).toHaveLength(typedManifest.modules.length)
    expect(triggerNodes).toHaveLength(3)
  })

  it('creates a contract edge from provider to consumer', () => {
    const { edges } = buildGraph(typedManifest)
    const edge = edges.find((e) => e.kind === 'contract' && e.source === 'persistence/sqlite' && e.target === 'authn/multi')
    expect(edge).toBeDefined()
    expect(edge?.label).toBe('persistence@1')
    expect(edge?.sourceHandle).toBe('contracts-out')
    expect(edge?.targetHandle).toBe('contracts-in')
  })

  it('creates an optional contract edge', () => {
    const { edges } = buildGraph(typedManifest)
    const edge = edges.find((e) => e.kind === 'contract-optional' && e.source === 'events/inmemory' && e.target === 'authn/multi')
    expect(edge).toBeDefined()
    expect(edge?.label).toBe('events@1')
  })

  it('creates pipeline edges following the login pipeline step order', () => {
    const { edges } = buildGraph(typedManifest)
    const first = edges.find((e) => e.kind === 'pipeline' && e.source === 'ratelimit/memory' && e.target === 'authn/multi')
    const second = edges.find((e) => e.kind === 'pipeline' && e.source === 'authn/multi' && e.target === 'events/inmemory')
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first?.pipelines).toContain('login')
  })

  it('has no self edges', () => {
    const { edges } = buildGraph(typedManifest)
    expect(edges.every((e) => e.source !== e.target)).toBe(true)
  })

  it('dedupes pipeline edges between the same module pair and collects pipeline names', () => {
    const { edges } = buildGraph(typedManifest)
    const authRequire = edges.filter((e) => e.kind === 'pipeline' && e.source === 'authn/multi' && e.target === 'authz/roles')
    expect(authRequire).toHaveLength(1)
    expect(authRequire[0]?.pipelines).toEqual(['listPages', 'insightsManifest'])
  })

  it('points trigger edges to the module owning the first pipeline step', () => {
    const { edges } = buildGraph(typedManifest)
    const httpEdge = edges.find((e) => e.kind === 'trigger' && e.source === 'trigger:http')
    expect(httpEdge).toBeDefined()
    expect(httpEdge?.target).toBe('ratelimit/memory')
  })

  it('removes an edge family when its option is off but keeps nodes', () => {
    const { nodes, edges } = buildGraph(typedManifest, { contracts: false })
    expect(edges.some((e) => e.kind === 'contract' || e.kind === 'contract-optional')).toBe(false)
    expect(nodes.filter((n) => n.kind === 'module')).toHaveLength(typedManifest.modules.length)
  })

  it('omits trigger nodes when triggers are off', () => {
    const { nodes, edges } = buildGraph(typedManifest, { triggers: false })
    expect(nodes.some((n) => n.kind === 'trigger')).toBe(false)
    expect(edges.some((e) => e.kind === 'trigger')).toBe(false)
  })

  it('yields no trigger node for a trigger kind with no entries', () => {
    const noCrons: InsightsManifest = { ...typedManifest, triggers: { ...typedManifest.triggers, crons: [] } }
    const { nodes, edges } = buildGraph(noCrons)
    expect(nodes.some((n) => n.id === 'trigger:cron')).toBe(false)
    expect(edges.some((e) => e.source === 'trigger:cron')).toBe(false)
  })
})

function step(spec: string, atomic?: number): InsightsPipelineStep {
  return { spec, name: spec, module: 'm', description: { summary: '', reads: [], writes: [] }, ...(atomic === undefined ? {} : { atomic }) }
}

describe('stepSegments', () => {
  it('keeps a step with no atomic ordinal as its own segment', () => {
    expect(stepSegments([step('a')])).toEqual([{ kind: 'step', step: step('a') }])
  })

  it('groups consecutive steps sharing the same ordinal into one segment', () => {
    const segments = stepSegments([step('a'), step('b', 1), step('c', 1), step('d')])
    expect(segments).toEqual([
      { kind: 'step', step: step('a') },
      { kind: 'group', steps: [step('b', 1), step('c', 1)] },
      { kind: 'step', step: step('d') },
    ])
  })

  it('starts a new group when the ordinal changes', () => {
    const segments = stepSegments([step('a', 1), step('b', 2)])
    expect(segments).toEqual([
      { kind: 'group', steps: [step('a', 1)] },
      { kind: 'group', steps: [step('b', 2)] },
    ])
  })
})
