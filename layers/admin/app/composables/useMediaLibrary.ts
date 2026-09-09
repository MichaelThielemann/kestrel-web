import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from '#imports'
import type { ListPage, MediaFolder, MediaItem } from '#kestrel-admin/types/api'
import { DEFAULT_PER_PAGE, clampPerPage } from '#kestrel-admin/utils/kestrel'
import { itemKey, computeRange, parentFolder, folderCounts, childFolders, type LibraryItem } from '../utils/library'

const VIEW_KEY = 'kestrel-media-view'

export type SortField = 'filename' | 'size' | 'createdAt'

export function useMediaLibrary(opts: { urlSync?: boolean; accept?: 'image' | 'any'; initialFolder?: string } = {}) {
  const urlSync = opts.urlSync ?? true
  const accept = opts.accept ?? 'any'

  const api = useApi()
  const route = useRoute()
  const router = useRouter()
  const { t } = useT()

  const displayLocale = useContentLocales().primary

  const folder = ref<string>(urlSync && typeof route.query.folder === 'string' ? route.query.folder : (opts.initialFolder ?? ''))
  const files = ref<MediaItem[]>([])
  const total = ref(0)
  const folderList = ref<MediaFolder[]>([])

  const search = ref('')
  const sort = ref<string>('-createdAt')
  const view = ref<'grid' | 'table'>('grid')
  const page = ref(1)
  const perPage = ref(DEFAULT_PER_PAGE)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selected = ref<Set<string>>(new Set())
  let anchorKey: string | null = null
  let token = 0

  if (import.meta.client) {
    const v = localStorage.getItem(VIEW_KEY)
    if (v === 'grid' || v === 'table') view.value = v
  }

  const counts = computed(() => folderCounts(folderList.value))
  const allFolderPaths = computed(() => [...counts.value.keys()].sort())
  const folders = computed(() => childFolders(counts.value, folder.value))
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

  const items = computed<LibraryItem[]>(() => {
    const sortedFolders = [...folders.value].sort((a, b) => a.name.localeCompare(b.name))
    return [
      ...sortedFolders.map((f) => ({ type: 'folder' as const, folder: f })),
      ...files.value.map((f) => ({ type: 'file' as const, file: f })),
    ]
  })

  const parentPath = computed(() => parentFolder(folder.value))
  const orderedKeys = computed(() => items.value.map(itemKey))
  const count = computed(() => selected.value.size)

  function checkFolder() {
    error.value = folder.value !== '' && !counts.value.has(folder.value) ? t('media.folderNotFound') : null
  }

  async function fetchFolders() {
    folderList.value = await api<MediaFolder[]>('/media/folders')
  }

  async function fetchFiles() {
    const my = ++token
    loading.value = true
    error.value = null
    try {
      const q = search.value.trim()

      const page1 = await api<ListPage<MediaItem>>('/media', {
        query: {
          folder: folder.value,
          limit: perPage.value,
          offset: (page.value - 1) * perPage.value,
          sort: sort.value,
          locale: displayLocale,
          ...(q ? { q } : {}),
        },
      })
      if (my !== token) return
      files.value = accept === 'image' ? page1.items.filter((i) => i.contentType.startsWith('image/')) : page1.items
      total.value = page1.total
      checkFolder()
    } catch (e) {
      if (my !== token) return
      error.value = apiErrorMessage(e)
    } finally {
      if (my === token) loading.value = false
    }
  }

  async function fetchLibrary() {
    await fetchFolders()
    await fetchFiles()
  }

  function navigate(path: string) {
    if (path === folder.value) return
    if (urlSync) return router.push({ query: path ? { folder: path } : {} })
    search.value = ''
    folder.value = path
    page.value = 1
    clear()
    checkFolder()
    fetchFiles()
  }

  function setSearch(s: string) { search.value = s; page.value = 1; fetchFiles() }

  function setView(v: 'grid' | 'table') {
    view.value = v
    if (import.meta.client) localStorage.setItem(VIEW_KEY, v)
  }

  function setSort(field: string) {
    sort.value = sort.value === field ? `-${field}` : field
    page.value = 1
    fetchFiles()
  }

  function setPage(p: number) { page.value = p; clear(); fetchFiles() }
  function setPerPage(n: number) { perPage.value = clampPerPage(n); page.value = 1; clear(); fetchFiles() }

  const isSelected = (item: LibraryItem) => selected.value.has(itemKey(item))
  function select(item: LibraryItem) { const k = itemKey(item); selected.value = new Set([k]); anchorKey = k }
  function toggle(item: LibraryItem) {
    const k = itemKey(item); const s = new Set(selected.value)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    selected.value = s; anchorKey = k
  }
  function range(item: LibraryItem) { selected.value = computeRange(orderedKeys.value, anchorKey ?? itemKey(item), itemKey(item), selected.value) }
  function clear() { selected.value = new Set(); anchorKey = null }
  function selectAll() { selected.value = new Set(orderedKeys.value) }

  if (urlSync) {
    watch(() => route.query.folder, (q) => {
      const next = typeof q === 'string' ? q : ''
      if (next === folder.value) return
      search.value = ''
      folder.value = next
      page.value = 1
      clear()
      checkFolder()
      fetchFiles()
    })
  }

  onMounted(() => fetchLibrary())

  return {
    folder, folders, files, search, sort, view, loading, error,
    page, perPage, total, totalPages,
    items, parentPath, orderedKeys, count, selected, allFolderPaths, counts,
    fetchLibrary, navigate, setSearch, setView, setSort, setPage, setPerPage,
    isSelected, select, toggle, range, clear, selectAll,
  }
}
