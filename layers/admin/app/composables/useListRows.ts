

import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ListPage } from '#kestrel-admin/types/api'
import { contentLocales } from '#kestrel-admin/utils/collections'

interface ListRowsOptions {
  collection: ComputedRef<string>
  sort: ComputedRef<string>
  page: ComputedRef<number>
  perPage: ComputedRef<number>
  locale: () => string | undefined

  clampPage: (page: number) => void

  onLoaded?: () => void
}

export function useListRows(opts: ListRowsOptions): {
  rows: Ref<Record<string, unknown>[]>
  total: Ref<number>
  fallbackTitles: Ref<Record<string, string>>
  error: Ref<string | null>
  totalPages: ComputedRef<number>
  fetchRows: () => Promise<void>
} {
  const { t } = useT()
  const api = useApi()
  const rows = ref<Record<string, unknown>[]>([])
  const total = ref(0)

  const fallbackTitles = ref<Record<string, string>>({})

  const error = ref<string | null>(null)
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / opts.perPage.value)))

  let seq = 0

  function query(locale: string | undefined, offset: number) {
    return { limit: opts.perPage.value, offset, sort: opts.sort.value, ...(locale ? { locale } : {}) }
  }

  async function loadFallbackTitles(items: Record<string, unknown>[], locale: string | undefined, offset: number, mine: number) {
    fallbackTitles.value = {}
    if (!locale || locale === contentLocales.primary) return
    if (!items.some((r) => r.title == null)) return
    try {
      const res = await api<ListPage<Record<string, unknown>>>(`/admin/${opts.collection.value}`, {
        query: query(contentLocales.primary, offset),
      })
      if (mine !== seq) return
      const map: Record<string, string> = {}
      for (const r of res.items) if (typeof r.title === 'string' && r.title) map[String(r.id)] = r.title
      fallbackTitles.value = map
    } catch {
      fallbackTitles.value = {}
    }
  }

  async function fetchRows() {
    const mine = ++seq
    const locale = opts.locale()
    const offset = (opts.page.value - 1) * opts.perPage.value
    try {
      const res = await api<ListPage<Record<string, unknown>>>(`/admin/${opts.collection.value}`, { query: query(locale, offset) })
      if (mine !== seq) return
      rows.value = res.items
      total.value = res.total
      error.value = null

      if (res.items.length === 0 && res.total > 0 && opts.page.value > 1) {
        opts.clampPage(Math.max(1, Math.ceil(res.total / opts.perPage.value)))
      }
      opts.onLoaded?.()
      await loadFallbackTitles(res.items, locale, offset, mine)
    } catch (e) {
      if (mine !== seq) return
      error.value = apiErrorMessage(e) || t('list.loadError')
    }
  }

  return { rows, total, fallbackTitles, error, totalPages, fetchRows }
}
