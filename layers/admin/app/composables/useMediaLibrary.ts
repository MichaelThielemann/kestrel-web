import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from '#imports'
import type { ListPage, MediaFolder, MediaItem } from '#kestrel-admin/types/api'
import { DEFAULT_PER_PAGE, clampPerPage } from '#kestrel-admin/utils/kestrel'
import { itemKey, computeRange, parentFolder, folderCounts, childFolders, type LibraryItem, type MediaTypeFilter } from '../utils/library'

const VIEW_KEY = 'kestrel-media-view'
const LAST_FOLDER_KEY = 'kestrel-media-last-folder'

export type SortField = 'filename' | 'size' | 'createdAt'

export function getLastMediaFolder(): string {
  if (!import.meta.client) return ''
  try {
    return localStorage.getItem(LAST_FOLDER_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberMediaFolder(path: string): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(LAST_FOLDER_KEY, path)
  // eslint-disable-next-line no-empty
  } catch {}
}

export function useMediaLibrary(opts: { urlSync?: boolean; accept?: 'image' | 'any'; initialFolder?: string } = {}) {
  const urlSync = opts.urlSync ?? true
  const accept = opts.accept ?? 'any'

  const api = useAdminApi()
  const capabilities = useCapabilities()
  const route = useRoute()
  const router = useRouter()
  const { t } = useT()

  const { primary: displayLocale } = useContentLocales()

  const folder = ref<string>(urlSync && typeof route.query.folder === 'string' ? route.query.folder : (opts.initialFolder ?? ''))
  rememberMediaFolder(folder.value)
  const files = ref<MediaItem[]>([])
  const total = ref(0)
  const folderList = ref<MediaFolder[]>([])

  const typeFilter = ref<MediaTypeFilter>(accept === 'image' ? 'image' : 'all')

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
    if (!capabilities.has('listMediaFolders')) { folderList.value = []; return }
    folderList.value = await api<MediaFolder[]>(capabilities.route('listMediaFolders'))
  }

  async function fetchFiles() {
    const my = ++token
    loading.value = true
    error.value = null
    try {
      const q = search.value.trim()

      const page1 = await api<ListPage<MediaItem>>(capabilities.route('listMedia'), {
        query: {
          folder: folder.value,
          limit: perPage.value,
          offset: (page.value - 1) * perPage.value,
          sort: sort.value,
          locale: displayLocale.value,
          ...(q ? { q } : {}),
          ...(typeFilter.value === 'all' ? {} : { type: typeFilter.value }),
        },
      })
      if (my !== token) return
      files.value = page1.items
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
    if (folder.value !== '' && !counts.value.has(folder.value)) {
      folder.value = ''
      rememberMediaFolder('')
    }
    await fetchFiles()
  }

  function navigate(path: string) {
    if (path === folder.value) return
    if (urlSync) return router.push({ query: path ? { folder: path } : {} })
    search.value = ''
    folder.value = path
    rememberMediaFolder(path)
    page.value = 1
    clear()
    checkFolder()
    void fetchFiles()
  }

  function setSearch(s: string) { search.value = s; page.value = 1; void fetchFiles() }

  function setTypeFilter(v: MediaTypeFilter) {
    if (accept === 'image') return
    typeFilter.value = v
    page.value = 1
    clear()
    void fetchFiles()
  }

  function setView(v: 'grid' | 'table') {
    view.value = v
    if (import.meta.client) localStorage.setItem(VIEW_KEY, v)
  }

  function setSort(field: string) {
    sort.value = sort.value === field ? `-${field}` : field
    page.value = 1
    void fetchFiles()
  }

  function setPage(p: number) { page.value = p; clear(); void fetchFiles() }
  function setPerPage(n: number) { perPage.value = clampPerPage(n); page.value = 1; clear(); void fetchFiles() }

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
      rememberMediaFolder(next)
      page.value = 1
      clear()
      checkFolder()
      void fetchFiles()
    })
  }

  onMounted(() => fetchLibrary())

  return {
    folder, folders, files, search, sort, view, loading, error,
    page, perPage, total, totalPages, typeFilter, accept,
    items, parentPath, orderedKeys, count, selected, allFolderPaths, counts,
    fetchLibrary, navigate, setSearch, setView, setSort, setPage, setPerPage, setTypeFilter,
    isSelected, select, toggle, range, clear, selectAll,
  }
}
