import { computed, ref } from 'vue'
import type { PageTreeNode } from '#kestrel-admin/types/api'
import type { ActionDeps } from '../actions/types'
import { apiErrorText } from './useApi'

/** One row of the page tree as it renders: the node, its depth, its place among its siblings and its sorted children's ids. */
export interface PageTreeRow {
  node: PageTreeNode
  depth: number
  position: number
  siblings: number
  children: string[]
}

const STORAGE_PREFIX = 'kestrel.admin.tree.'

function readExpanded(collection: string): Set<string> {
  if (!import.meta.client) return new Set()
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + collection)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeExpanded(collection: string, ids: ReadonlySet<string>): void {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(STORAGE_PREFIX + collection, JSON.stringify([...ids]))
  } catch {
    return
  }
}

/** Every id below `id` in `nodes`, following parent links; a cycle stops where it closes. */
export function descendantsOf(nodes: readonly PageTreeNode[], id: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parent === null) continue
    children.set(node.parent, [...(children.get(node.parent) ?? []), node.id])
  }
  const out = new Set<string>()
  const queue = [...(children.get(id) ?? [])]
  while (queue.length > 0) {
    const next = queue.pop()!
    if (out.has(next) || next === id) continue
    out.add(next)
    queue.push(...(children.get(next) ?? []))
  }
  return out
}

/** Siblings sorted by label; a node whose parent is unknown counts as a root. */
export function childrenByParent(nodes: readonly PageTreeNode[]): Map<string | null, PageTreeNode[]> {
  const known = new Set(nodes.map((node) => node.id))
  const out = new Map<string | null, PageTreeNode[]>()
  for (const node of nodes) {
    const parent = node.parent !== null && known.has(node.parent) ? node.parent : null
    out.set(parent, [...(out.get(parent) ?? []), node])
  }
  for (const list of out.values()) list.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
  return out
}

/** The pages of a collection with a parent field as a tree, and which of its branches stay open while the browser tab lives. */
export function usePageTree(deps: Pick<ActionDeps, 'api' | 'capabilities' | 't'>, collection: string) {
  const nodes = ref<PageTreeNode[]>([])
  const loading = ref(false)
  const error = ref('')
  const expanded = ref<Set<string>>(readExpanded(collection))
  const available = computed(() => deps.capabilities.hasVerb(collection, 'tree'))

  async function load(): Promise<void> {
    if (!available.value) return
    loading.value = true
    error.value = ''
    try {
      nodes.value = await deps.api<PageTreeNode[]>(deps.capabilities.verbRoute(collection, 'tree'))
    } catch (e) {
      error.value = apiErrorText(deps.t, e)
    } finally {
      loading.value = false
    }
  }

  const children = computed(() => childrenByParent(nodes.value))

  const rows = computed<PageTreeRow[]>(() => {
    const out: PageTreeRow[] = []
    const seen = new Set<string>()
    const visit = (parent: string | null, depth: number) => {
      const siblings = children.value.get(parent) ?? []
      siblings.forEach((node, index) => {
        if (seen.has(node.id)) return
        seen.add(node.id)
        const kids = (children.value.get(node.id) ?? []).map((child) => child.id)
        out.push({ node, depth, position: index + 1, siblings: siblings.length, children: kids })
        if (kids.length > 0 && expanded.value.has(node.id)) visit(node.id, depth + 1)
      })
    }
    visit(null, 0)
    return out
  })

  function setExpanded(id: string, open: boolean): void {
    const next = new Set(expanded.value)
    if (open) next.add(id)
    else next.delete(id)
    expanded.value = next
    writeExpanded(collection, next)
  }

  function parentOf(id: string): string | null {
    const node = nodes.value.find((entry) => entry.id === id)
    return node?.parent ?? null
  }

  return { nodes, rows, loading, error, available, expanded, load, setExpanded, parentOf }
}
