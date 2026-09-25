import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import type { ListPage, MediaItem } from '#kestrel-admin/types/api'
import type { LibraryItem } from '../utils/library'
import { isInsertable, isPickGated } from '../utils/media-insert'
import type { VariantWatchEntry } from './useVariantWatch'

export interface UseMediaPickOptions {
  pick: boolean
  multiple: boolean
  /** Ids the field already holds; they are never gated on availability. */
  initialSelected: readonly string[]
  items: Ref<LibraryItem[]>
  files: Ref<MediaItem[]>
  isSelected: (item: LibraryItem) => boolean
  select: (item: LibraryItem) => void
  /** The freshest polled state per id; it wins over the listing. */
  fresh: Ref<ReadonlyMap<string, VariantWatchEntry>>
  track: (id: string) => void
  onConfirm: (ids: string[]) => void
}

/** Selection and confirmation for the media library in pick mode: availability gates only the ids this pick adds, never an id the field already holds, and a selected tile can always be deselected. Confirming emits the selection as it stands once every added id, including one picked while a check ran, passed the check. */
export function useMediaPick(options: UseMediaPickOptions) {
  const { pick, multiple, items, files, fresh, track } = options
  const api = useAdminApi()
  const capabilities = useCapabilities()
  const { primary } = useContentLocales()
  const { t } = useT()

  const stored: ReadonlySet<string> = new Set(options.initialSelected)
  const listed = ref<Map<string, MediaItem>>(new Map())
  const picked = ref<Set<string>>(new Set(pick && multiple ? options.initialSelected : []))
  const confirming = ref(false)
  const refused = shallowRef<ReadonlyMap<string, { name: string; seen: VariantWatchEntry | undefined }>>(new Map())
  const checkFailed = ref(false)

  watch(files, (list) => {
    for (const f of list) {
      listed.value.set(f.id, f)
      if (pick && !isInsertable(f)) track(f.id)
    }
  }, { immediate: true })

  const isSelectedItem = (i: LibraryItem) => (pick && multiple
    ? i.type === 'file' && picked.value.has(i.file.id)
    : options.isSelected(i))

  function select(item: LibraryItem) {
    checkFailed.value = false
    if (!multiple) { options.select(item); return }
    if (item.type !== 'file') return
    const next = new Set(picked.value)
    if (next.has(item.file.id)) next.delete(item.file.id)
    else next.add(item.file.id)
    picked.value = next
  }

  const selectedFileIds = computed(() => (pick && multiple
    ? [...picked.value]
    : items.value
      .filter((i): i is Extract<LibraryItem, { type: 'file' }> => i.type === 'file' && options.isSelected(i))
      .map((i) => i.file.id)))

  const hasBlockedSelection = computed(() => selectedFileIds.value.some((id) => isPickGated(id, fresh.value.get(id) ?? listed.value.get(id), stored)))

  const stillRefused = computed(() => [...refused.value].filter(([id, { seen }]) => {
    if (!selectedFileIds.value.includes(id)) return false
    const latest = fresh.value.get(id)
    return latest === undefined || latest === seen || !isInsertable(latest)
  }))
  const refusal = computed(() => {
    if (stillRefused.value.length) return t('media.pick.refused', { names: stillRefused.value.map(([, { name }]) => name).join(', ') })
    return checkFailed.value ? t('media.pick.checkFailed') : ''
  })

  async function recheck(ids: string[]): Promise<boolean> {
    try {
      const page = await api<ListPage<MediaItem>>(capabilities.route('listMedia'), { query: { ids: ids.join(','), locale: primary.value } })
      const bad = page.items.filter((item) => !isInsertable(item))
      refused.value = new Map(bad.map((item) => [item.id, { name: item.filename, seen: fresh.value.get(item.id) }]))
      for (const item of bad) track(item.id)
      return bad.length === 0
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
    checkFailed.value = false
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

  return { storedIds: stored, isSelectedItem, select, selectedFileIds, hasBlockedSelection, confirming, refusal, confirm }
}
