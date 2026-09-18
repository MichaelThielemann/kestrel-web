import { ref, type ComputedRef } from 'vue'
import type { Workflow } from '#kestrel-admin/types/kestrel'
import { bulkDelete, bulkSetStatus, previewBulkDelete } from '../actions/list'
import { toastUnexpected } from '../actions/steps/notify'
import type { BatchDeleteReport } from '../utils/collection-ops'

export function useListBatchActions(
  collection: ComputedRef<string>,
  refetch: () => void | Promise<void>,
  workflow: ComputedRef<Workflow | undefined>,
) {
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
    toastUnexpected(deps, r)
    deleteReport.value = r.ok ? (r.result ?? null) : null
    deleteOpen.value = true
  }

  async function confirmDelete() {
    const r = await runAction(bulkDelete, { deps, collection: collection.value, ids: deleteIds.value, confirmed: true, ops, refresh: refetch })
    toastUnexpected(deps, r)
    if (r.ok) deleteOpen.value = false
  }

  async function setStatus(ids: string[], live: boolean, locale?: string) {
    const current = workflow.value
    if (!current) return
    const r = await runAction(bulkSetStatus, { deps, collection: collection.value, ids, workflow: current, live, locale, ops, refresh: refetch })
    toastUnexpected(deps, r)
  }

  return { busy, error, deleteOpen, deleteReport, askDelete, confirmDelete, setStatus }
}
