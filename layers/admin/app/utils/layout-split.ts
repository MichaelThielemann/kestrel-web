import type { LayoutNode } from '#kestrel/types/kestrel'

function nodeHasField(node: LayoutNode, fields: Set<string>): boolean {
  const rows = node.kind === 'row' ? [node] : node.rows
  return rows.some((row) => row.fields.some((f) => fields.has(f)))
}

export function splitLayoutAfter(layout: LayoutNode[], fields: string[]): [LayoutNode[], LayoutNode[]] {
  const targets = new Set(fields)
  const index = layout.findIndex((node) => nodeHasField(node, targets))
  if (index === -1) return [layout, []]
  return [layout.slice(0, index + 1), layout.slice(index + 1)]
}
