import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import type { ListPage, MediaItem } from '#kestrel-admin/types/api'
import { inBlocks } from '../actions/mediaPrecheck'
import { isInsertable, isPickGated } from '../utils/media-insert'
import type { MediaSelection } from './useMediaSelection'
import type { VariantWatchEntry } from './useVariantWatch'

export interface UseMediaPickOptions {
  pick: boolean
  /** Ids the field already holds; they are never gated on availability. */
  initialSelected: readonly string[]
  files: Ref<MediaItem[]>
  /** The library selection; in multi-pick it holds the picks. */
  selection: Pick<MediaSelection, 'selectedFileIds' | 'forget'>
  /** The freshest polled state per id; it wins over the listing. */
  fresh: Ref<ReadonlyMap<string, VariantWatchEntry>>
  track: (id: string) => void
  onConfirm: (ids: string[]) => void
}

/** Confirmation for the media library in pick mode: availability gates only the ids this pick adds, never an id the field already holds, and a selected tile can always be deselected. Confirming emits the selection as it stands once every added id, including one picked while a check ran, passed the check; an added id missing from the check's answer leaves the selection and is refused. The check asks in blocks and asks again for the ids an answer left out until an answer adds none, so a server that answers fewer ids per request than it was sent never makes a pick look gone. */
export function useMediaPick(options: UseMediaPickOptions) {
  const { pick, files, fresh, track, selection } = options
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const { primary } = useContentLocales()
  const { t } = useT()

  const stored: ReadonlySet<string> = new Set(options.initialSelected)
  const listed = ref<Map<string, MediaItem>>(new Map())
  const confirming = ref(false)
  const refused = shallowRef<ReadonlyMap<string, { name: string; seen: VariantWatchEntry | undefined }>>(new Map())
  const checkFailed = ref(false)
  const missing = ref<string[]>([])

  watch(files, (list) => {
    for (const f of list) {
      listed.value.set(f.id, f)
      if (pick && !isInsertable(f)) track(f.id)
    }
  }, { immediate: true })

  function resetNotice() {
    checkFailed.value = false
    missing.value = []
  }

  const selectedFileIds = selection.selectedFileIds

  const hasBlockedSelection = computed(() => selectedFileIds.value.some((id) => isPickGated(id, fresh.value.get(id) ?? listed.value.get(id), stored)))

  const stillRefused = computed(() => [...refused.value].filter(([id, { seen }]) => {
    if (!selectedFileIds.value.includes(id)) return false
    const latest = fresh.value.get(id)
    return latest === undefined || latest === seen || !isInsertable(latest)
  }))
  const refusal = computed(() => {
    const notices: string[] = []
    if (missing.value.length) notices.push(t('media.pick.missing', { names: missing.value.join(', ') }))
    if (stillRefused.value.length) notices.push(t('media.pick.refused', { names: stillRefused.value.map(([, { name }]) => name).join(', ') }))
    if (checkFailed.value) notices.push(t('media.pick.checkFailed'))
    return notices.join(' ')
  })

  async function lookUp(ids: string[]): Promise<MediaItem[]> {
    const found: MediaItem[] = []
    for (const block of inBlocks(ids)) {
      for (let rest = block; rest.length;) {
        const page = await api<ListPage<MediaItem>>(capabilities.route('listMedia'), { query: { ids: rest.join(','), locale: primary.value } })
        const answered = new Set(page.items.map((item) => item.id))
        const next = rest.filter((id) => !answered.has(id))
        found.push(...page.items.filter((item) => rest.includes(item.id)))
        if (next.length === rest.length) break
        rest = next
      }
    }
    return found
  }

  async function recheck(ids: string[]): Promise<boolean> {
    try {
      const items = await lookUp(ids)
      const bad = items.filter((item) => !isInsertable(item))
      refused.value = new Map(bad.map((item) => [item.id, { name: item.filename, seen: fresh.value.get(item.id) }]))
      for (const item of bad) track(item.id)
      const found = new Set(items.map((item) => item.id))
      const gone = ids.filter((id) => !found.has(id))
      if (gone.length) {
        missing.value = gone.map((id) => listed.value.get(id)?.filename ?? id)
        selection.forget(gone)
      }
      return bad.length === 0 && gone.length === 0
    } catch {
      checkFailed.value = true
      return false
    }
  }

  const uncheckedIds = (checked: ReadonlySet<string>) => (capabilities.has('listMedia')
    ? selectedFileIds.value.filter((id) => !stored.has(id) && !checked.has(id))
    : [])

  async function confirm() {
    if (confirming.value || !selectedFileIds.value.length) return
    refused.value = new Map()
    resetNotice()
    confirming.value = true
    try {
      const checked = new Set<string>()
      for (let ids = uncheckedIds(checked); ids.length; ids = uncheckedIds(checked)) {
        if (!(await recheck(ids))) return
        for (const id of ids) checked.add(id)
      }
      if (selectedFileIds.value.length) options.onConfirm(selectedFileIds.value)
    } finally {
      confirming.value = false
    }
  }

  function forget(ids: readonly string[]) {
    selection.forget(ids)
  }

  return { storedIds: stored, resetNotice, forget, selectedFileIds, hasBlockedSelection, confirming, refusal, confirm }
}
