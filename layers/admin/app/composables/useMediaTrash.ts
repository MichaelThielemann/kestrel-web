import { computed, onMounted, ref } from 'vue'
import type { MediaTrashItem, MediaTrashPage } from '#kestrel-admin/types/api'
import { DEFAULT_PER_PAGE, clampPerPage } from '#kestrel-admin/utils/kestrel'
import { runAction } from '#kestrel-core/app/utils/actions'
import { emptyTrash, purgeItems, restoreItems, type BulkReport } from '../actions/mediaTrash'
import { toastUnexpected } from '../actions/steps/notify'
import type { ApiClient } from '../actions/types'
import type { CapabilityResolver } from '../utils/capabilities'
import { countMessage, removalState, reportProblems, type RemovalDialogState } from '../utils/media-removal'

/** The number of items in the media trash, for the library's entry to it; `null` while unknown or without access. */
export function useMediaTrashCount() {
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const count = ref<number | null>(null)

  async function refresh() {
    if (!capabilities.has('listMediaTrash')) return
    try {
      count.value = (await api<MediaTrashPage>(capabilities.route('listMediaTrash'), { query: { limit: 1 } })).total
    } catch {
      count.value = null
    }
  }

  return { count, refresh }
}

const TRASH_SCAN_PAGE = 100
const TRASH_SCAN_PAGES = 10

/** Looks the ids up in the media trash and answers the filename of each one found there; reads at most the 1000 most recently trashed items. */
export async function findTrashed(api: ApiClient, capabilities: CapabilityResolver, ids: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  if (!ids.length || !capabilities.has('listMediaTrash')) return found
  const wanted = new Set(ids)
  for (let page = 0; page < TRASH_SCAN_PAGES && found.size < wanted.size; page++) {
    const res = await api<MediaTrashPage>(capabilities.route('listMediaTrash'), { query: { limit: TRASH_SCAN_PAGE, offset: page * TRASH_SCAN_PAGE } })
    for (const item of res.items) if (wanted.has(item.id)) found.set(item.id, item.filename)
    if ((page + 1) * TRASH_SCAN_PAGE >= res.total) break
  }
  return found
}

/** The media trash view: one page of trashed items, a selection of them, restoring at once and deleting for good after a dialog. */
export function useMediaTrash() {
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const deps = useActionDeps()
  const toasts = useToast()
  const { t } = useT()
  const { primary } = useContentLocales()

  const items = ref<MediaTrashItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const perPage = ref(DEFAULT_PER_PAGE)
  const loading = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const dialog = ref<RemovalDialogState | null>(null)
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))
  const selection = useListSelection(computed(() => items.value))
  let pending: string[] = []
  let controller: AbortController | null = null

  const canRestore = computed(() => capabilities.has('restoreMedia'))
  const canPurge = computed(() => capabilities.has('purgeMedia'))
  const canEmpty = computed(() => capabilities.has('emptyMediaTrash'))
  const nameOf = (id: string) => items.value.find((item) => item.id === id)?.filename ?? id

  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await api<MediaTrashPage>(capabilities.route('listMediaTrash'), {
        query: { limit: perPage.value, offset: (page.value - 1) * perPage.value, locale: primary.value },
      })
      items.value = res.items
      total.value = res.total
      const listed = new Set(res.items.map((item) => item.id))
      for (const id of [...selection.selected]) if (!listed.has(id)) selection.selected.delete(id)
      if (!res.items.length && page.value > 1) {
        page.value = Math.min(page.value - 1, totalPages.value)
        await load()
      }
    } catch (e) {
      error.value = apiErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  function setPage(p: number) { page.value = p; void load() }
  function setPerPage(n: number) { perPage.value = clampPerPage(n); page.value = 1; void load() }

  async function restore(ids: string[]) {
    if (!ids.length || busy.value) return
    busy.value = true
    const r = await runAction(restoreItems, { deps, ids, refresh: load }).finally(() => { busy.value = false })
    toastUnexpected(deps, r)
    if (!r.ok || !r.result) return
    const { done, failed, renamed } = r.result
    if (done.length) toasts.success(countMessage(t, 'media.trash.restored', done.length))
    if (failed.length) toasts.error(t('media.trash.restoreFailed', { names: failed.map((f) => nameOf(f.id)).join(', ') }))
    if (renamed.length) toasts.info(t('media.trash.renamed', { names: renamed.map((rn) => `${rn.from} → ${rn.to}`).join(', ') }))
  }

  function askPurge(ids: string[]) {
    if (!ids.length || !canPurge.value) return
    pending = ids
    const entries = ids.map((id) => {
      const item = items.value.find((i) => i.id === id)
      return { id, name: item?.filename ?? id, path: null, contentType: item?.contentType, refs: [] }
    })
    dialog.value = removalState('purge', { files: ids.length, entries })
  }

  function askEmpty() {
    if (!canEmpty.value || !total.value) return
    pending = []
    dialog.value = removalState('empty', { files: total.value })
  }

  function onProgress(done: number, all: number) {
    if (dialog.value && all > 1) dialog.value = { ...dialog.value, progress: { done, total: all } }
  }

  async function confirm() {
    const current = dialog.value
    if (!current || current.finished || busy.value) return
    busy.value = true
    controller = new AbortController()
    const r = current.mode === 'empty'
      ? await runAction(emptyTrash, { deps, refresh: load })
      : await runAction(purgeItems, { deps, ids: pending, refresh: load, signal: controller.signal, onProgress })
    busy.value = false
    controller = null
    toastUnexpected(deps, r)
    if (r.ok && r.result) settle(r.result)
  }

  function settle(report: BulkReport) {
    if (report.done.length) toasts.success(countMessage(t, 'media.trash.purged', report.done.length))
    const problems = reportProblems(t, report, nameOf)
    if (problems.failures.length || problems.skipped.length || problems.cancelled) {
      if (dialog.value) dialog.value = { ...dialog.value, ...problems, progress: null, finished: true }
      return
    }
    dialog.value = null
  }

  function cancel() {
    if (controller) controller.abort()
    else dialog.value = null
  }

  onMounted(load)

  return {
    items, total, page, perPage, totalPages, loading, busy, error, dialog, selection,
    canRestore, canPurge, canEmpty, load, setPage, setPerPage, restore, askPurge, askEmpty, confirm, cancel,
  }
}
