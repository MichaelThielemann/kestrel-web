import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { Document, ListPage } from '#kestrel-admin/types/api'
import type { FieldOption } from '../utils/field-component'
import { contentLocales } from '../utils/collections'

const LIMIT = 200

export function useRecordOptions(
  collection: Ref<string>,
  ids: Ref<string[]>,
  locale: Ref<string>,
  labelField?: Ref<string | undefined>,
) {
  const api = useApi()
  const all = ref<FieldOption[]>([])
  const options = ref<FieldOption[]>([])
  const loading = ref(false)
  const cache = computed(() => new Map(all.value.map((o) => [o.value, o.label])))

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
    return inherited ? `${inherited} (${contentLocales.primary.toUpperCase()})` : doc.id
  }

  async function load(name: string) {
    loading.value = true
    try {
      const list = (query: Record<string, unknown>) => api<ListPage<Document>>(`/admin/${name}`, { query: { ...query, limit: LIMIT } })
      const [page, primaryPage] = await Promise.all([
        list({ locale: locale.value }),
        locale.value === contentLocales.primary ? null : list({ locale: contentLocales.primary }),
      ])
      if (collection.value !== name) return
      const primary = new Map((primaryPage?.items ?? []).map((doc) => [doc.id, rawLabel(doc) ?? '']))
      all.value = page.items.map((doc) => ({ value: doc.id, label: labelOf(doc, primary) }))
      options.value = all.value
    } catch {
      if (collection.value === name) { all.value = []; options.value = [] }
    } finally {
      if (collection.value === name) loading.value = false
    }
  }

  watch([collection, locale], () => {
    all.value = []
    options.value = []
    if (collection.value) void load(collection.value)
  }, { immediate: true })

  function onSearch(term: string) {
    const q = term.trim().toLowerCase()
    options.value = q ? all.value.filter((o) => o.label.toLowerCase().includes(q)) : all.value
  }

  return { options, selected, loading, onSearch }
}
