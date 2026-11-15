import { onUnmounted, ref, watch } from 'vue'
import type { ListPage } from '#kestrel-admin/types/api'
import type { ActionDeps } from '../actions/types'

const PAGE = 100

/** The page tree's labels in a locale other than the primary one: each page's own `title` there, read from the collection's `listAll`. `loaded` is false in the primary locale, without `listAll` and when the read failed; `titles` then has no entries. */
export function usePageTreeTitles(deps: Pick<ActionDeps, 'api' | 'capabilities'>, collection: string, locale: () => string, primary: () => string) {
  const titles = ref<Record<string, string>>({})
  const loaded = ref(false)
  let request = 0

  async function load(current: string): Promise<void> {
    const mine = ++request
    titles.value = {}
    loaded.value = false
    if (current === primary() || !deps.capabilities.hasVerb(collection, 'listAll')) return
    const out: Record<string, string> = {}
    try {
      for (let offset = 0; ; offset += PAGE) {
        const page = await deps.api<ListPage<Record<string, unknown>>>(deps.capabilities.verbRoute(collection, 'listAll'), { query: { locale: current, limit: PAGE, offset } })
        if (mine !== request) return
        for (const item of page.items) if (typeof item.title === 'string' && item.title !== '') out[String(item.id)] = item.title
        if (page.items.length < PAGE || offset + PAGE >= page.total) break
      }
    } catch {
      return
    }
    titles.value = out
    loaded.value = true
  }

  const stop = watch(locale, (current) => { void load(current) }, { immediate: true })
  onUnmounted(() => {
    stop()
    request++
  })

  return { titles, loaded, load: () => load(locale()) }
}
