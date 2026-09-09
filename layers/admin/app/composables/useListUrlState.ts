import { toggleSort, isValidSort } from '../utils/list-query'
import { sortableKeys } from '../utils/list-columns'
import type { SerializedCollection } from '#kestrel-admin/types/kestrel'
import { clampPerPage, DEFAULT_PER_PAGE } from '#kestrel-admin/utils/kestrel'

const DEFAULT_SORT = '-updatedAt'

export function useListUrlState(schema: SerializedCollection) {
  const route = useRoute()
  const router = useRouter()
  const perPageCookie = useCookie<number>('kestrel-list-per-page', { default: () => DEFAULT_PER_PAGE })
  const validSortKeys = sortableKeys(schema)

  function firstStr(v: unknown): string | undefined {
    const s = Array.isArray(v) ? v[0] : v
    return typeof s === 'string' ? s : undefined
  }

  const sort = computed(() => {
    const s = firstStr(route.query.sort)
    return s && isValidSort(s, validSortKeys) ? s : DEFAULT_SORT
  })
  const page = computed(() => {
    const p = Number(firstStr(route.query.page))
    return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
  })
  const perPage = computed(() => {
    const pp = firstStr(route.query.perPage)
    if (pp != null) {
      const n = Number(pp)
      if (Number.isFinite(n)) return clampPerPage(n)
    }
    return clampPerPage(perPageCookie.value)
  })

  function go(patch: Partial<{ sort: string; page: number; perPage: number }>, mode: 'push' | 'replace') {
    const next = { sort: sort.value, page: page.value, perPage: perPage.value, ...patch }
    const locale = route.query.locale
    return router[mode]({ query: { sort: next.sort, page: next.page, perPage: next.perPage, ...(typeof locale === 'string' ? { locale } : {}) } })
  }

  const setSort = (f: string) => go({ sort: toggleSort(sort.value, f), page: 1 }, 'replace')
  const setPage = (p: number) => go({ page: p }, 'push')

  const clampPage = (p: number) => go({ page: p }, 'replace')
  const setPerPage = (n: number) => { perPageCookie.value = clampPerPage(n); return go({ perPage: clampPerPage(n), page: 1 }, 'replace') }

  return { sort, page, perPage, setSort, setPage, clampPage, setPerPage }
}
