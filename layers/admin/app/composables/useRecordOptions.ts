import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { Document, ListPage } from '#kestrel-admin/types/api'
import type { FieldOption } from '../utils/field-component'

const LIMIT = 200

export function useRecordOptions(
  collection: Ref<string>,
  ids: Ref<string[]>,
  locale: Ref<string>,
  labelField?: Ref<string | undefined>,
  exclude?: Ref<ReadonlySet<string>>,
) {
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const { primary: primaryLocale } = useContentLocales()
  const loaded = ref<FieldOption[]>([])
  const all = computed(() => (exclude === undefined || exclude.value.size === 0 ? loaded.value : loaded.value.filter((o) => !exclude.value.has(o.value))))
  const options = ref<FieldOption[]>([])
  const loading = ref(false)
  const cache = computed(() => new Map(loaded.value.map((o) => [o.value, o.label])))

  const selected = computed<FieldOption[]>(() =>
    ids.value.map((value) => ({ value, label: cache.value.get(value) ?? value })),
  )

  function rawLabel(doc: Document): string | null {
    const raw = doc[labelField?.value ?? 'title']
    return typeof raw === 'string' && raw.trim() ? raw : null
  }

  function labelOf(doc: Document, primary: Map<string, string>): string {
    const own = rawLabel(doc)
    if (own) return own
    const inherited = primary.get(doc.id)
    return inherited ? `${inherited} (${primaryLocale.value.toUpperCase()})` : doc.id
  }

  async function load(name: string) {
    loading.value = true
    if (!capabilities.hasVerb(name, 'listAll')) {
      loaded.value = []
      options.value = []
      loading.value = false
      return
    }
    try {
      const list = (query: Record<string, unknown>) => api<ListPage<Document>>(capabilities.verbRoute(name, 'listAll'), { query: { ...query, limit: LIMIT } })
      const [page, primaryPage] = await Promise.all([
        list({ locale: locale.value }),
        locale.value === primaryLocale.value ? null : list({ locale: primaryLocale.value }),
      ])
      if (collection.value !== name) return
      const primary = new Map((primaryPage?.items ?? []).map((doc) => [doc.id, rawLabel(doc) ?? '']))
      loaded.value = page.items.map((doc) => ({ value: doc.id, label: labelOf(doc, primary) }))
      options.value = all.value
    } catch {
      if (collection.value === name) { loaded.value = []; options.value = [] }
    } finally {
      if (collection.value === name) loading.value = false
    }
  }

  watch([collection, locale], () => {
    loaded.value = []
    options.value = []
    if (collection.value) void load(collection.value)
  }, { immediate: true })

  if (exclude !== undefined) watch(exclude, () => { options.value = all.value })

  function onSearch(term: string) {
    const q = term.trim().toLowerCase()
    options.value = q ? all.value.filter((o) => o.label.toLowerCase().includes(q)) : all.value
  }

  return { options, selected, loading, onSearch }
}
