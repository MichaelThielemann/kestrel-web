import { computed, onMounted, ref } from 'vue'
import type { MediaTrashItem, MediaTrashPage, ReferenceTo } from '#kestrel-admin/types/api'
import { DEFAULT_PER_PAGE, clampPerPage } from '#kestrel-admin/utils/kestrel'
import { runAction } from '#kestrel-core/app/utils/actions'
import { inBlocks } from '../actions/mediaPrecheck'
import { WHOLE_TRASH, emptyTrash, purgeItems, restoreItems, type BulkReport } from '../actions/mediaTrash'
import { toastUnexpected } from '../actions/steps/notify'
import type { ApiClient } from '../actions/types'
import type { CapabilityResolver } from '../utils/capabilities'
import { countMessage, hasProblems, removalState, reportProblems, restoreMessages, type RemovalDialogState } from '../utils/media-removal'
import { onMediaChanged } from './useMediaChanges'

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

/** The ids among `ids` that pages still use, looked up in blocks; empty without the lookup or when it fails. */
export async function referencedIds(api: ApiClient, capabilities: CapabilityResolver, ids: readonly string[]): Promise<Set<string>> {
  const used = new Set<string>()
  if (!ids.length || !capabilities.has('mediaReferrersMany')) return used
  try {
    for (const block of inBlocks(ids)) {
      const found = await api<Record<string, ReferenceTo[]>>(capabilities.route('mediaReferrersMany'), { query: { ids: block.join(',') } })
      for (const id of block) if (found[id]?.length) used.add(id)
    }
  } catch {
    used.clear()
  }
  return used
}

/** The media trash view: one page of trashed items, which of them pages still use, a selection of them, restoring at once and deleting for good after a dialog. Stop is offered only while another request is left to send. A kept item off the page shown is named by a lookup in the trash. `onSettled` runs once a restore or a final delete is over and its dialog closed, and after a change made elsewhere reloaded the view, so the view can put focus back. */
export function useMediaTrash(opts: { onSettled?: () => void } = {}) {
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
  const inUse = ref<ReadonlySet<string>>(new Set())
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))
  const selection = useListSelection(computed(() => items.value))
  let pending: string[] = []
  let controller: AbortController | null = null
  let token = 0

  const canRestore = computed(() => capabilities.has('restoreMedia'))
  const canPurge = computed(() => capabilities.has('purgeMedia'))
  const canEmpty = computed(() => capabilities.has('emptyMediaTrash'))
  let names = new Map<string, string>()
  const knownName = (id: string) => names.get(id) ?? items.value.find((item) => item.id === id)?.filename
  const nameOf = (id: string) => (id === WHOLE_TRASH ? t('media.trash.title') : (knownName(id) ?? id))

  async function load() {
    const my = ++token
    loading.value = true
    error.value = null
    try {
      const res = await api<MediaTrashPage>(capabilities.route('listMediaTrash'), {
        query: { limit: perPage.value, offset: (page.value - 1) * perPage.value, locale: primary.value },
      })
      if (my !== token) return
      items.value = res.items
      total.value = res.total
      void referencedIds(api, capabilities, res.items.map((item) => item.id)).then((used) => { if (my === token) inUse.value = used })
      const listed = new Set(res.items.map((item) => item.id))
      for (const id of [...selection.selected]) if (!listed.has(id)) selection.selected.delete(id)
      if (!res.items.length && page.value > 1) {
        page.value = Math.min(page.value - 1, totalPages.value)
        await load()
      }
    } catch (e) {
      if (my === token) error.value = apiErrorMessage(e)
    } finally {
      if (my === token) loading.value = false
    }
  }

  function setPage(p: number) { page.value = p; void load() }
  function setPerPage(n: number) { perPage.value = clampPerPage(n); page.value = 1; void load() }

  async function restore(ids: string[]) {
    if (!ids.length || busy.value) return
    busy.value = true
    const names = new Map(items.value.map((item) => [item.id, item.filename]))
    const reported: { report?: BulkReport } = {}
    const r = await runAction(restoreItems, { deps, ids, refresh: load, report: (report) => { reported.report = report } }).finally(() => { busy.value = false })
    toastUnexpected(deps, r)
    const report = (r.ok ? r.result : undefined) ?? reported.report
    if (!report) return
    for (const { type, message } of restoreMessages(t, report, (id) => names.get(id) ?? id)) toasts[type](message)
    opts.onSettled?.()
  }

  function askPurge(ids: string[]) {
    if (!ids.length || !canPurge.value) return
    pending = ids
    names = new Map(items.value.map((item) => [item.id, item.filename]))
    const entries = ids.map((id) => {
      const item = items.value.find((i) => i.id === id)
      return { id, name: item?.filename ?? id, path: null, contentType: item?.contentType, refs: [] }
    })
    dialog.value = removalState('purge', { files: ids.length, entries })
  }

  function askEmpty() {
    if (!canEmpty.value || !total.value) return
    pending = []
    names = new Map(items.value.map((item) => [item.id, item.filename]))
    dialog.value = removalState('empty', { files: total.value })
  }

  function onProgress(done: number, all: number) {
    if (dialog.value && all > 1) dialog.value = { ...dialog.value, progress: { done, total: all }, stoppable: done < all - 1 }
  }

  async function confirm() {
    const current = dialog.value
    if (!current || current.finished || busy.value) return
    busy.value = true
    const purging = current.mode !== 'empty'
    controller = purging ? new AbortController() : null
    dialog.value = { ...current, stoppable: purging && inBlocks(pending).length > 1 }
    const reported: { report?: BulkReport } = {}
    const report = (rep: BulkReport) => { reported.report = rep }
    const r = current.mode === 'empty'
      ? await runAction(emptyTrash, { deps, refresh: load, report })
      : await runAction(purgeItems, { deps, ids: pending, refresh: load, signal: controller?.signal, onProgress, report })
    controller = null
    toastUnexpected(deps, r)
    const outcome = (r.ok ? r.result : undefined) ?? reported.report
    if (outcome?.skipped.length) await nameKept(outcome)
    busy.value = false
    if (outcome) settle(outcome)
  }

  async function nameKept(report: BulkReport) {
    const unknown = report.skipped.map((s) => s.id).filter((id) => id !== WHOLE_TRASH && knownName(id) === undefined)
    try {
      for (const [id, filename] of await findTrashed(api, capabilities, unknown)) names.set(id, filename)
    } catch {
      return
    }
  }

  function settle(report: BulkReport) {
    if (report.done.length) toasts.success(countMessage(t, 'media.trash.purged', report.done.length))
    const problems = reportProblems(t, report, nameOf)
    if (hasProblems(problems)) {
      if (dialog.value) dialog.value = { ...dialog.value, ...problems, progress: null, stoppable: false, finished: true }
      return
    }
    dialog.value = null
    opts.onSettled?.()
  }

  function cancel() {
    if (busy.value) {
      if (dialog.value?.stoppable) controller?.abort()
      return
    }
    const settled = dialog.value?.finished === true
    dialog.value = null
    if (settled) opts.onSettled?.()
  }

  onMounted(load)
  onMediaChanged(async () => {
    await load()
    opts.onSettled?.()
  })

  return {
    items, total, page, perPage, totalPages, loading, busy, error, dialog, selection, inUse,
    canRestore, canPurge, canEmpty, load, setPage, setPerPage, restore, askPurge, askEmpty, confirm, cancel,
  }
}
