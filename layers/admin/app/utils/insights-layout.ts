import dagre from '@dagrejs/dagre'
import type { GraphEdge, GraphNode } from '#kestrel-admin/utils/insights-graph'

const DEFAULT_NODE_SIZE = { width: 220, height: 120 }
const TRIGGER_NODE_SIZE = { width: 160, height: 56 }

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], size?: { width: number; height: number }): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 80 })

  for (const node of nodes) {
    const dims = size ?? (node.kind === 'trigger' ? TRIGGER_NODE_SIZE : DEFAULT_NODE_SIZE)
    graph.setNode(node.id, { width: dims.width, height: dims.height })
  }
  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
    graph.setEdge(edge.source, edge.target)
  }

  dagre.layout(graph)

  const positions = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    const g = graph.node(node.id) as { x: number; y: number } | undefined
    if (!g) continue
    const dims = size ?? (node.kind === 'trigger' ? TRIGGER_NODE_SIZE : DEFAULT_NODE_SIZE)
    positions.set(node.id, { x: g.x - dims.width / 2, y: g.y - dims.height / 2 })
  }
  return positions
}
