import type { InsightsManifest, InsightsModule } from '#kestrel-admin/types/api'

export interface GraphNode {
  id: string
  kind: 'module' | 'trigger'
  label: string
  module?: InsightsModule
  trigger?: { kind: 'http' | 'event' | 'cron'; count: number }
  counts: {
    config: number
    errors: number
  }
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: 'contract' | 'contract-optional' | 'pipeline' | 'trigger'
  label: string
  pipelines?: string[]
  sourceHandle: string
  targetHandle: string
}

export interface BuildGraphOptions {
  contracts?: boolean
  pipelines?: boolean
  triggers?: boolean
}

const TRIGGER_KINDS = ['http', 'event', 'cron'] as const
type TriggerKind = (typeof TRIGGER_KINDS)[number]

function errorCountOf(module: InsightsModule, manifest: InsightsManifest): number {
  const codes = new Set<string>()
  for (const step of manifest.steps) {
    if (step.module !== module.name || !step.description?.errors) continue
    for (const code of Object.keys(step.description.errors)) codes.add(code)
  }
  return codes.size
}

function providerOf(manifest: InsightsManifest, contract: string): InsightsModule | undefined {
  return manifest.modules.find((m) => m.provides.includes(contract))
}

function firstStepModule(pipeline: InsightsManifest['pipelines'][number]): string | undefined {
  return pipeline.steps[0]?.module
}

export function buildGraph(manifest: InsightsManifest, options?: BuildGraphOptions): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const contracts = options?.contracts ?? true
  const pipelines = options?.pipelines ?? true
  const triggers = options?.triggers ?? true

  const nodes: GraphNode[] = manifest.modules.map((module) => ({
    id: module.name,
    kind: 'module',
    label: module.name,
    module,
    counts: {
      config: module.config.variables.length,
      errors: errorCountOf(module, manifest),
    },
  }))

  const edges: GraphEdge[] = []

  if (contracts) {
    for (const module of manifest.modules) {
      for (const contract of module.requires) {
        const provider = providerOf(manifest, contract)
        if (!provider || provider.name === module.name) continue
        edges.push({
          id: `contract:${provider.name}:${module.name}:${contract}`,
          source: provider.name,
          target: module.name,
          kind: 'contract',
          label: contract,
          sourceHandle: 'contracts-out',
          targetHandle: 'contracts-in',
        })
      }
      for (const contract of module.optional) {
        const provider = providerOf(manifest, contract)
        if (!provider || provider.name === module.name) continue
        edges.push({
          id: `contract-optional:${provider.name}:${module.name}:${contract}`,
          source: provider.name,
          target: module.name,
          kind: 'contract-optional',
          label: contract,
          sourceHandle: 'contracts-out',
          targetHandle: 'contracts-in',
        })
      }
    }
  }

  if (pipelines) {
    const pipelineEdges = new Map<string, { source: string; target: string; pipelines: string[] }>()
    for (const pipeline of manifest.pipelines) {
      for (let i = 0; i < pipeline.steps.length - 1; i++) {
        const source = pipeline.steps[i]?.module
        const target = pipeline.steps[i + 1]?.module
        if (!source || !target || source === target) continue
        const key = `${source}->${target}`
        const existing = pipelineEdges.get(key)
        if (existing) {
          if (!existing.pipelines.includes(pipeline.name)) existing.pipelines.push(pipeline.name)
        } else {
          pipelineEdges.set(key, { source, target, pipelines: [pipeline.name] })
        }
      }
    }
    for (const [key, value] of pipelineEdges) {
      const label = value.pipelines.length > 1 ? `${value.pipelines[0]} +${value.pipelines.length - 1}` : value.pipelines[0] ?? ''
      edges.push({
        id: `pipeline:${key}`,
        source: value.source,
        target: value.target,
        kind: 'pipeline',
        label,
        pipelines: value.pipelines,
        sourceHandle: 'steps-out',
        targetHandle: 'steps-in',
      })
    }
  }

  if (triggers) {
    const countsByKind: Record<TriggerKind, number> = { http: manifest.triggers.http.length, event: manifest.triggers.events.length, cron: manifest.triggers.crons.length }
    const pipelinesByKind: Record<TriggerKind, string[]> = {
      http: manifest.triggers.http.map((t) => t.pipeline),
      event: manifest.triggers.events.map((t) => t.pipeline),
      cron: manifest.triggers.crons.map((t) => t.pipeline),
    }

    for (const kind of TRIGGER_KINDS) {
      if (countsByKind[kind] === 0) continue
      const nodeId = `trigger:${kind}`
      nodes.push({
        id: nodeId,
        kind: 'trigger',
        label: kind,
        trigger: { kind, count: countsByKind[kind] },
        counts: { config: 0, errors: 0 },
      })

      const targetPipelines = new Map<string, string[]>()
      for (const pipelineName of pipelinesByKind[kind]) {
        const pipeline = manifest.pipelines.find((p) => p.name === pipelineName)
        const targetModule = pipeline ? firstStepModule(pipeline) : undefined
        if (!targetModule) continue
        const existing = targetPipelines.get(targetModule)
        if (existing) {
          if (!existing.includes(pipelineName)) existing.push(pipelineName)
        } else {
          targetPipelines.set(targetModule, [pipelineName])
        }
      }
      for (const [targetModule, pipelineNames] of targetPipelines) {
        edges.push({
          id: `trigger:${kind}:${targetModule}`,
          source: nodeId,
          target: targetModule,
          kind: 'trigger',
          label: String(pipelineNames.length),
          pipelines: pipelineNames,
          sourceHandle: 'trigger-out',
          targetHandle: 'trigger-in',
        })
      }
    }
  }

  return { nodes, edges }
}
