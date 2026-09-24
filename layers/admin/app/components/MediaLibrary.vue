<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import type { MediaItem, Provenance, ReferenceTo } from '#kestrel-admin/types/api'
import { createFolder, renameOrMove, setMediaMeta, setMediaProvenance, type RenameOrMoveTarget } from '#kestrel-admin/actions/media'
import type { BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { LibraryItem } from '../utils/library'
import { joinFolder } from '../utils/library'
import type { PendingUpload } from '../utils/dnd'
import type { DropResult } from '../composables/useMediaDnd'
import type { UploadItem } from '../composables/useMediaUpload'
import type { MediaViewerSave } from '../utils/media-meta'
import { toOpItem, effectiveTargets, type OpItem } from '../utils/ops'
import { isInsertable } from '../utils/media-insert'

const props = defineProps<{ pick?: boolean; multiple?: boolean; accept?: 'image' | 'any'; initialFolder?: string; initialSelected?: string[] }>()
const emit = defineEmits<{ confirm: [string[]]; cancel: [] }>()

const lib = useMediaLibrary({ urlSync: !props.pick, accept: props.accept, initialFolder: props.pick ? props.initialFolder : undefined })
const { folder, view, search, sort, items, files, parentPath, isSelected, loading, error, allFolderPaths, counts: folderCounts, page, perPage, total, totalPages } = lib

const picked = ref<Set<string>>(new Set(props.pick && props.multiple ? props.initialSelected ?? [] : []))
const isSelectedItem = (i: LibraryItem) => (props.pick && props.multiple
  ? i.type === 'file' && picked.value.has(i.file.id)
  : isSelected(i))

const { t } = useT()
const toast = useToast()
const deps = useActionDeps()
const { schema } = useSchema()
const mediaCaps = useMediaCapabilities()

const mediaRefresh: RefreshPort = () => { void lib.fetchLibrary(); lib.clear() }
const opsBusy = ref(false)
const opError = ref<string | null>(null)
const opConflict = ref<ReferenceTo[] | null>(null)

const opsPort: BusyPort = {
  setBusy: (on) => { opsBusy.value = on },
  busy: () => opsBusy.value,
  setError: (message) => { opError.value = message },
  setConflict: (refs) => { opConflict.value = refs },
}

const onUploadError = (item: UploadItem) => toast.error(t('media.uploadError', { name: item.filename, reason: item.message || t('media.uploadFailedReason') }))
const mediaUploads = useMediaLibraryUploads({ folder, view, fetchLibrary: lib.fetchLibrary, onError: onUploadError, t })
const { gridTileUploads, queueRows, onDismissUpload: dismissUpload, previewFor, variantResults, stalledIds, limitError } = mediaUploads
function onDismissUpload(id: string) {
  dismissUpload(id)
  void nextTick(() => mediaLibraryRef.value?.focus())
}

const newFolderOpen = ref(false)
const uploadOpen = ref(false)
const pendingUploads = ref<PendingUpload[]>([])

const mediaLibraryRef = ref<HTMLElement | null>(null)
let focusReturnTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (focusReturnTimer) clearTimeout(focusReturnTimer) })
const viewerOpen = ref(false)
const viewerFile = ref<MediaItem | null>(null)
const viewerBusy = ref(false)
const viewerError = ref('')

const { deleteOpen, deleteInfo, askDelete, onConfirmDelete, close: closeDelete } = useMediaDelete({
  deps: () => deps,
  ops: opsPort,
  refresh: mediaRefresh,
  files,
  folderCounts,
  schema,
  canDeleteTargets: (targets) => mediaCaps.canDeleteTargets(targets),
  onDeletedFromViewer: () => {
    viewerOpen.value = false
    viewerFile.value = null
    void nextTick().then(() => {
      if (focusReturnTimer) clearTimeout(focusReturnTimer)
      focusReturnTimer = setTimeout(() => { mediaLibraryRef.value?.focus() }, 0)
    })
  },
})

function onOpenItem(item: LibraryItem) {
  if (item.type !== 'file') return
  if (props.pick) { onSelect(item, { toggle: false, range: false }); return }
  viewerFile.value = item.file
  viewerError.value = ''
  viewerOpen.value = true
}
async function onSaveViewer(save: MediaViewerSave) {
  const f = viewerFile.value
  if (!f) return
  viewerBusy.value = true
  viewerError.value = ''
  let ok = true
  if (save.provenance) {
    const result = await runAction(setMediaProvenance, { deps, id: f.id, provenance: save.provenance, ops: opsPort, refresh: mediaRefresh })
    toastUnexpected(deps, result)
    ok = result.ok
  }
  if (ok && save.meta) {
    const result = await runAction(setMediaMeta, { deps, id: f.id, locale: save.meta.locale, fields: save.meta.fields, ops: opsPort, refresh: mediaRefresh })
    toastUnexpected(deps, result)
    ok = result.ok
  }
  viewerBusy.value = false
  if (ok) { viewerOpen.value = false; return }
  viewerError.value = opError.value ?? t('mediaViewer.saveFailed')
}

function onSelect(item: LibraryItem, mods: { toggle: boolean; range: boolean }) {
  if (props.pick && props.multiple) {
    if (item.type !== 'file') return
    const s = new Set(picked.value)
    if (s.has(item.file.id)) s.delete(item.file.id)
    else s.add(item.file.id)
    picked.value = s
    return
  }

  if (props.pick) { lib.select(item); return }
  if (mods.range) lib.range(item)
  else if (mods.toggle) lib.toggle(item)
  else lib.select(item)
}

const selectedFileIds = computed(() => (props.pick && props.multiple
  ? [...picked.value]
  : items.value
    .filter((i): i is Extract<LibraryItem, { type: 'file' }> => i.type === 'file' && isSelected(i))
    .map((i) => i.file.id)))
const hasBlockedSelection = computed(() => selectedFileIds.value.some((id) => {
  const found = items.value.find((i): i is Extract<LibraryItem, { type: 'file' }> => i.type === 'file' && i.file.id === id)
  return found !== undefined && !isInsertable(found.file)
}))
function onConfirmPick() { emit('confirm', selectedFileIds.value) }

function queueUploads(pending: PendingUpload[]) {
  if (error.value || !pending.length || !mediaCaps.canUpload.value) return
  mediaUploads.reset()
  pendingUploads.value = pending
  uploadOpen.value = true
}
function onUpload(files: File[]) {
  queueUploads(files.map((file) => ({ file, folder: folder.value })))
}
function onConfirmUpload(provenance: Provenance) {
  uploadOpen.value = false
  const pending = pendingUploads.value
  pendingUploads.value = []
  void mediaUploads.enqueueUploads(pending, provenance)
}

async function onCreateFolder(name: string) {
  if (error.value || !mediaCaps.canCreateFolder.value) return
  const r = await runAction(createFolder, { deps, path: joinFolder(folder.value, name), ops: opsPort, refresh: mediaRefresh })
  toastUnexpected(deps, r)
  if (r.ok) newFolderOpen.value = false
}

async function onDropResult({ uploads, folders }: DropResult) {
  if (error.value) return
  if (folders.length && !mediaCaps.canCreateFolder.value) return
  for (const path of folders) {
    const r = await runAction(createFolder, { deps, path, ops: opsPort, refresh: mediaRefresh })
    toastUnexpected(deps, r)
    if (!r.ok) return
  }
  queueUploads(uploads)
}

const draggedItems = ref<OpItem[]>([])
function onItemDragStart(item: LibraryItem, e: DragEvent) {
  const set = effectiveTargets(item, lib.isSelected, items.value.filter((i) => lib.isSelected(i)))
  if (!mediaCaps.canMoveTargets(set)) { e.preventDefault(); return }
  draggedItems.value = set.map(toOpItem)
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-kestrel-media', '1')
  e.dataTransfer.setData('text/plain', set.map((i) => (i.type === 'file' ? i.file.filename : i.folder.path)).join('\n'))
  e.dataTransfer.effectAllowed = 'copyMove'
}
function onItemDragEnd() { draggedItems.value = [] }

const { dragActive, dropFolder, onDragEnter, onDragOver, onDragLeave, onDrop } = useMediaDnd({
  currentFolder: () => folder.value,
  onDrop: (result) => { void onDropResult(result) },
  draggedItems: () => draggedItems.value,
  onMove: (opItems, dest) => {
    if (!mediaCaps.canMoveTargets(opItems)) return
    void runAction(renameOrMove, { deps, target: { kind: 'move', targets: opItems, dest }, notify: 'toast', ops: opsPort, refresh: mediaRefresh }).then((result) => toastUnexpected(deps, result))
  },
})

function onViewerDelete() {
  const f = viewerFile.value
  if (!f) return
  void askDelete([{ type: 'file', id: f.id }], 'viewer')
}

const renameOpen = ref(false)
const renameTarget = ref<LibraryItem | null>(null)
const renameName = computed(() => {
  const target = renameTarget.value
  if (!target) return ''
  return target.type === 'file' ? target.file.filename : target.folder.name
})
async function onConfirmRename(name: string) {
  const target = renameTarget.value
  if (!target || !mediaCaps.canRenameTarget(target)) return
  const rtarget: RenameOrMoveTarget = target.type === 'file'
    ? { kind: 'file-rename', id: target.file.id, filename: name }
    : { kind: 'folder-rename', path: target.folder.path, name }
  const r = await runAction(renameOrMove, { deps, target: rtarget, notify: 'inline', ops: opsPort, refresh: mediaRefresh })
  toastUnexpected(deps, r)
  if (!r.ok) return
  renameOpen.value = false
  renameTarget.value = null
}

const { menuItems, onContextMenu, onSelect: onMenuSelect } = useMediaContextMenu({
  items: () => items.value,
  isSelected: lib.isSelected,
  select: lib.select,
  onDelete: (opItems) => { void askDelete(opItems) },
  onRename: (item) => { opError.value = null; renameTarget.value = item; renameOpen.value = true },
  canRename: (item) => mediaCaps.canRenameTarget(item),
  canDelete: (targets) => mediaCaps.canDeleteTargets(targets),
})

const localizedMenu = computed(() => menuItems.value.map((s) => ({
  label: t(s.labelKey, s.count != null ? { n: s.count } : undefined),
  value: s.value,
  ...(s.danger ? { danger: true } : {}),
})))
</script>

<template>
  <section ref="mediaLibraryRef" class="media-library" tabindex="-1" @click.self="lib.clear()" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <KestrelMediaPathBar :folder="folder" :folders="allFolderPaths" @navigate="lib.navigate" />
    <KestrelMediaToolbar
      :view="view"
      :search="search"
      :status="mediaUploads.status.value"
      :disabled="!!error"
      :can-upload="mediaCaps.canUpload.value"
      :can-create-folder="mediaCaps.canCreateFolder.value"
      @update:view="lib.setView"
      @update:search="lib.setSearch"
      @upload="onUpload"
      @new-folder="newFolderOpen = true"
    />
    <KestrelUiMenu :items="localizedMenu" @select="onMenuSelect">

      <div class="media-library__items" @contextmenu.capture="onContextMenu">
        <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
        <p v-else-if="!loading && !items.length && !(view === 'grid' && gridTileUploads.length)" class="media-library__empty">{{ t('media.folderEmpty') }}</p>
        <KestrelMediaGrid v-else-if="view === 'grid'" :items="items" :is-selected="isSelectedItem" :drop-target-path="dropFolder" :parent-path="parentPath" :up-label="t('media.parentFolder')" :pick="pick"
          :uploads="gridTileUploads" :upload-preview="previewFor" :variant-override="variantResults" :stalled-ids="stalledIds"
          @navigate="lib.navigate" @select="onSelect" @open="onOpenItem" @dragstart="onItemDragStart" @dragend="onItemDragEnd" @dismiss-upload="onDismissUpload" />
        <KestrelMediaTable v-else :items="items" :is-selected="isSelectedItem" :drop-target-path="dropFolder" :sort="sort" :parent-path="parentPath" :up-label="t('media.parentFolder')" @navigate="lib.navigate" @select="onSelect" @open="onOpenItem" @sort="lib.setSort" @dragstart="onItemDragStart" @dragend="onItemDragEnd" />
      </div>
    </KestrelUiMenu>
    <KestrelCollectionListPager
      v-if="totalPages > 1"
      :page="page"
      :total-pages="totalPages"
      :total="total"
      :per-page="perPage"
      @update:page="lib.setPage"
      @update:per-page="lib.setPerPage"
    />
    <KestrelMediaUploadQueue v-if="queueRows.length" :items="queueRows" @dismiss="onDismissUpload" />
    <KestrelUiAlert v-if="limitError" variant="error">{{ limitError }}</KestrelUiAlert>
    <div v-if="pick" class="media-library__pickbar">
      <span>{{ selectedFileIds.length }} {{ t('media.selected') }}</span>
      <KestrelUiButton variant="primary" :disabled="!selectedFileIds.length || hasBlockedSelection" @click="onConfirmPick">{{ t('media.useSelected') }}</KestrelUiButton>
      <KestrelUiButton variant="ghost" @click="emit('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
    </div>
    <KestrelMediaUploadDialog
      :open="uploadOpen"
      :uploads="pendingUploads"
      :folder="folder"
      @confirm="onConfirmUpload"
      @update:open="(v) => { if (!v) { uploadOpen = false; pendingUploads = [] } }"
    />
    <KestrelMediaNewFolderDialog v-model:open="newFolderOpen" :busy="opsBusy" :error="opError" @create="onCreateFolder" />
    <KestrelMediaViewer
      :open="viewerOpen"
      :file="viewerFile"
      :can-save="mediaCaps.canRenameFile.value"
      :can-delete="mediaCaps.canDeleteFile.value"
      :busy="viewerBusy"
      :error="viewerError"
      @update:open="(v) => { viewerOpen = v }"
      @save="onSaveViewer"
      @delete="onViewerDelete"
    />
    <KestrelUiAlert v-if="opError && !deleteOpen && !renameOpen && !viewerOpen && !newFolderOpen" variant="error">{{ opError }}</KestrelUiAlert>
    <KestrelMediaDeleteDialog
      :open="deleteOpen"
      :summary="deleteInfo"
      :busy="opsBusy"
      :error="opError"
      :conflict="opConflict"
      @confirm="onConfirmDelete"
      @update:open="(v) => { if (!v) { closeDelete(); opConflict = null } }"
    />
    <KestrelMediaRenameDialog
      :open="renameOpen"
      :name="renameName"
      :kind="renameTarget?.type"
      :busy="opsBusy"
      :error="opError"
      @rename="onConfirmRename"
      @update:open="(v) => { if (!v) { renameOpen = false; renameTarget = null } }"
    />
    <div v-if="dragActive && !dropFolder && !error && mediaCaps.canUpload.value" class="media-library__dropzone" aria-hidden="true">{{ t('media.dropToUpload') }}</div>
  </section>
</template>

<style lang="scss" scoped>
.media-library {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  flex: 1 1 auto;
  min-height: 0;
}

.media-library > :not(.media-library__items) {
  flex: 0 0 auto;
}
.media-library__items {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.media-library__dropzone {
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay);
  display: grid;
  place-items: center;
  background: var(--color-scrim);
  color: var(--color-on-primary);
  font-size: var(--text-lg);
  border-radius: var(--radius-md);
  pointer-events: none;
}

.media-library__empty {
  color: var(--color-text-muted);
  font-size: var(--text-base);
  padding: var(--space-6) 0;
  text-align: center;
}

.media-library__pickbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
}
</style>
