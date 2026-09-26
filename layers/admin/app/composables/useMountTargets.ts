import { onMounted, ref } from 'vue'
import type { Document, ListPage } from '#kestrel-admin/types/api'
import type { ActionDeps } from '../actions/types'

/** A page a mounted collection can live under, with its path in the primary locale. */
export interface MountTarget {
  id: string
  label: string
  path: string | null
}

const LIMIT = 200

function pathIn(doc: Document, locale: string): string | null {
  const paths: unknown = doc._paths
  if (typeof paths !== 'object' || paths === null) return null
  const value: unknown = Reflect.get(paths, locale)
  return typeof value === 'string' ? value : null
}

/** The pages a mounted collection can be assigned to, and how many documents each mounted collection holds. */
export function useMountTargets(deps: Pick<ActionDeps, 'api' | 'capabilities'>, collections: () => readonly string[], primary: () => string) {
  const pages = ref<MountTarget[]>([])
  const counts = ref<Record<string, number>>({})

  async function load(): Promise<void> {
    if (!deps.capabilities.hasVerb('pages', 'listAll')) return
    const locale = primary()
    try {
      const list = await deps.api<ListPage<Document>>(deps.capabilities.verbRoute('pages', 'listAll'), { query: { locale, limit: LIMIT } })
      pages.value = list.items
        .map((doc) => ({ id: doc.id, label: typeof doc.title === 'string' && doc.title !== '' ? doc.title : doc.id, path: pathIn(doc, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    } catch {
      pages.value = []
    }
    const next: Record<string, number> = {}
    for (const name of collections()) {
      if (!deps.capabilities.hasVerb(name, 'listAll')) continue
      try {
        next[name] = (await deps.api<ListPage<Document>>(deps.capabilities.verbRoute(name, 'listAll'), { query: { limit: 1 } })).total
      } catch {
        continue
      }
    }
    counts.value = next
  }

  onMounted(() => { void load() })
  return { pages, counts, load }
}
