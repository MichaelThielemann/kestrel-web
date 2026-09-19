import type { Revision, RevisionSummary } from '#kestrel-admin/types/api'
import { labelRevision, loadRevisions, readRevision, restoreRevision } from '../actions/revisions'
import { toastUnexpected } from '../actions/steps/notify'
import type { ActionDeps, BusyPort } from '../actions/types'
import { layoutRevisions } from '../utils/revision-lanes'

export const HISTORY_PAGE_SIZE = 50

export interface UsePageHistoryOptions {
  collection: string
  id: string
  locale: Ref<string>
  onRestored: () => Promise<void> | void
}

export function usePageHistory(opts: UsePageHistoryOptions) {
  const { t } = useT()
  const api = useApi()
  const toast = useToast()
  const deps: ActionDeps = { api, t, toast }

  const items = ref<RevisionSummary[]>([])
  const head = ref<string | null>(null)
  const total = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const selectedId = ref<string | null>(null)
  const detail = ref<Revision | null>(null)
  const detailLoading = ref(false)

  const ops: BusyPort = {
    setBusy: (on) => { busy.value = on },
    busy: () => busy.value,
    setError: (message) => { error.value = message },
  }

  const layout = computed(() => layoutRevisions(items.value, head.value))
  const hasMore = computed(() => items.value.length < total.value)
  const selected = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)

  function scope() {
    return { deps, collection: opts.collection, id: opts.id, locale: opts.locale.value }
  }

  async function fetchDetail(revisionId: string): Promise<void> {
    detailLoading.value = true
    detail.value = null
    const result = await runAction(readRevision, { ...scope(), revisionId })
    toastUnexpected(deps, result)
    if (selectedId.value !== revisionId) return
    detail.value = result.ok ? (result.result ?? null) : null
    if (!result.ok) error.value = result.error
    detailLoading.value = false
  }

  async function select(revisionId: string): Promise<void> {
    if (selectedId.value === revisionId) return
    selectedId.value = revisionId
    error.value = null
    await fetchDetail(revisionId)
  }

  async function fetchPage(offset: number): Promise<boolean> {
    const result = await runAction(loadRevisions, { ...scope(), limit: HISTORY_PAGE_SIZE, offset })
    toastUnexpected(deps, result)
    if (!result.ok || !result.result) {
      error.value = result.ok ? t('revisions.loadFailed') : result.error
      return false
    }
    items.value = offset === 0 ? result.result.items : [...items.value, ...result.result.items]
    head.value = result.result.head
    total.value = result.result.total
    return true
  }

  async function reload(): Promise<void> {
    loading.value = true
    error.value = null
    const loaded = await fetchPage(0)
    loading.value = false
    if (!loaded) return
    const next = items.value.find((item) => item.id === selectedId.value) ?? items.value[0]
    if (!next) {
      selectedId.value = null
      detail.value = null
      return
    }
    selectedId.value = null
    await select(next.id)
  }

  async function loadMore(): Promise<void> {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    await fetchPage(items.value.length)
    loadingMore.value = false
  }

  async function restore(revisionId: string): Promise<boolean> {
    const result = await runAction(restoreRevision, {
      ...scope(),
      revisionId,
      confirmed: true,
      ops,
      refresh: async () => {
        await opts.onRestored()
        await reload()
      },
    })
    toastUnexpected(deps, result)
    return result.ok
  }

  async function saveLabel(revisionId: string, label: string | null): Promise<boolean> {
    const result = await runAction(labelRevision, { ...scope(), revisionId, label, ops })
    toastUnexpected(deps, result)
    if (!result.ok || !result.result) return false
    const summary = result.result
    items.value = items.value.map((item) => (item.id === summary.id ? { ...item, label: summary.label } : item))
    if (detail.value && detail.value.id === summary.id) detail.value = { ...detail.value, label: summary.label }
    return true
  }

  return { items, head, total, loading, loadingMore, busy, error, selectedId, selected, detail, detailLoading, layout, hasMore, reload, loadMore, select, restore, saveLabel }
}
