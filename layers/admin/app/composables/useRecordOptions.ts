import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { Document, ListPage } from '#kestrel-admin/types/api'
import type { FieldOption } from '../utils/field-component'
import { statusHint } from '../utils/workflow-status'

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
  const { collections } = useCollections()
  const { lang } = useT()
  const loadedDocs = ref<{ value: string; label: string; doc: Document }[]>([])
  const schema = computed(() => collections.value.find((c) => c.name === collection.value))
  const loaded = computed<FieldOption[]>(() => loadedDocs.value.map(({ value, label, doc }) => {
    const hint = schema.value ? statusHint(schema.value, doc, lang.value) : undefined
    return hint === undefined ? { value, label } : { value, label, hint }
  }))
  const all = computed(() => (exclude === undefined || exclude.value.size === 0 ? loaded.value : loaded.value.filter((o) => !exclude.value.has(o.value))))
  const term = ref('')
  const options = computed(() => (term.value ? all.value.filter((o) => o.label.toLowerCase().includes(term.value)) : all.value))
  const loading = ref(false)
  const cache = computed(() => new Map(loaded.value.map((o) => [o.value, o])))

  const selected = computed<FieldOption[]>(() => ids.value.map((value) => cache.value.get(value) ?? { value, label: value }))

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

  let run = 0

  async function load(name: string) {
    const current = ++run
    loading.value = true
    if (!capabilities.hasVerb(name, 'listAll')) {
      loadedDocs.value = []
      loading.value = false
      return
    }
    try {
      const list = (query: Record<string, unknown>) => api<ListPage<Document>>(capabilities.verbRoute(name, 'listAll'), { query: { ...query, limit: LIMIT } })
      const [page, primaryPage] = await Promise.all([
        list({ locale: locale.value }),
        locale.value === primaryLocale.value ? null : list({ locale: primaryLocale.value }),
      ])
      if (current !== run) return
      const primary = new Map((primaryPage?.items ?? []).map((doc) => [doc.id, rawLabel(doc) ?? '']))
      loadedDocs.value = page.items.map((doc) => ({ value: doc.id, label: labelOf(doc, primary), doc }))
      term.value = ''
    } catch {
      if (current === run) loadedDocs.value = []
    } finally {
      if (current === run) loading.value = false
    }
  }

  watch([collection, locale], () => {
    loadedDocs.value = []
    if (collection.value) void load(collection.value)
    else run++
  }, { immediate: true })

  function onSearch(value: string) {
    term.value = value.trim().toLowerCase()
  }

  return { options, selected, loading, onSearch }
}
