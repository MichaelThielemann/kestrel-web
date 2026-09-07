import { ref, type ComputedRef } from 'vue'
import { bulkDelete, bulkSetStatus, previewBulkDelete } from '../actions/list'
import type { BatchDeleteReport } from '../utils/collection-ops'

export function useListBatchActions(collection: ComputedRef<string>, refetch: () => void | Promise<void>) {
  const { t } = useT()
  const api = useApi()
  const toast = useToast()
  const { can } = useAuth()
  const deps = { api, t, toast }

  const busy = ref(false)
  const error = ref<string | null>(null)
  const ops = {
    setBusy: (on: boolean) => { busy.value = on },
    busy: () => busy.value,
    setError: (message: string | null) => { error.value = message },
  }

  const deleteOpen = ref(false)
  const deleteReport = ref<BatchDeleteReport | null>(null)
  const deleteIds = ref<string[]>([])

  async function askDelete(ids: string[]) {
    if (!ids.length) return
    deleteIds.value = ids
    const r = await runAction(previewBulkDelete, { deps, collection: collection.value, ids, allowed: can('pages.manage') })
    deleteReport.value = r.ok ? (r.result ?? null) : null
    deleteOpen.value = true
  }

  async function confirmDelete() {
    const r = await runAction(bulkDelete, { deps, collection: collection.value, ids: deleteIds.value, confirmed: true, ops, refresh: refetch })
    if (r.ok) deleteOpen.value = false
  }

  async function setStatus(ids: string[], status: 'published' | 'draft', locale?: string) {
    await runAction(bulkSetStatus, { deps, collection: collection.value, ids, status, locale, ops, refresh: refetch })
  }

  return { busy, error, deleteOpen, deleteReport, askDelete, confirmDelete, setStatus }
}
