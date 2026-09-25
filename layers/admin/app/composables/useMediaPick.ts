import { computed, ref, watch, type Ref } from 'vue'
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

/** Selection and confirmation for the media library in pick mode: availability gates only the ids this pick adds, never an id the field already holds, and a selected tile can always be deselected. */
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
  const refusal = ref('')

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
    refusal.value = ''
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

  async function recheck(added: string[]): Promise<boolean> {
    confirming.value = true
    try {
      const page = await api<ListPage<MediaItem>>(capabilities.route('listMedia'), { query: { ids: added.join(','), locale: primary.value } })
      const refused = page.items.filter((item) => !isInsertable(item))
      for (const item of refused) track(item.id)
      if (refused.length) refusal.value = t('media.pick.refused', { names: refused.map((item) => item.filename).join(', ') })
      return refused.length === 0
    } catch {
      refusal.value = t('media.pick.checkFailed')
      return false
    } finally {
      confirming.value = false
    }
  }

  async function confirm() {
    if (confirming.value) return
    const ids = selectedFileIds.value
    if (!ids.length) return
    refusal.value = ''
    const added = ids.filter((id) => !stored.has(id))
    if (added.length && capabilities.has('listMedia') && !(await recheck(added))) return
    options.onConfirm(ids)
  }

  return { storedIds: stored, isSelectedItem, select, selectedFileIds, hasBlockedSelection, confirming, refusal, confirm }
}
