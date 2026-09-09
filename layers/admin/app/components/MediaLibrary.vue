<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MediaItem, Provenance, ReferenceTo } from '#kestrel-admin/types/api'
import { createFolder, deleteItems, previewDeleteItems, renameOrMove, setMediaMeta, setMediaProvenance, type RenameOrMoveTarget } from '#kestrel-admin/actions/media'
import type { ActionDeps, BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import type { LibraryItem } from '../utils/library'
import { folderIsEmpty, joinFolder } from '../utils/library'
import type { PendingUpload } from '../utils/dnd'
import type { DropResult } from '../composables/useMediaDnd'
import type { MediaViewerSave } from './MediaViewer.vue'
import { deleteSummary, toOpItem, effectiveTargets, resolveFileTargets, type DeleteSummary, type OpItem } from '../utils/ops'

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
const api = useApi()
const { can } = useAuth()

const mediaRefresh: RefreshPort = () => { lib.fetchLibrary(); lib.clear() }
const opsBusy = ref(false)
const opError = ref<string | null>(null)
const opConflict = ref<ReferenceTo[] | null>(null)

const mediaDeps = (): ActionDeps => ({ api, t, toast })
const opsPort: BusyPort = {
  setBusy: (on) => { opsBusy.value = on },
  busy: () => opsBusy.value,
  setError: (message) => { opError.value = message },
  setConflict: (refs) => { opConflict.value = refs },
}

const upload = useMediaUpload({
  onSettled: () => lib.fetchLibrary(),
  onError: (item) => toast.error(t('media.uploadError', { name: item.filename, reason: item.message || t('media.uploadFailedReason') })),
})
const { active, counts } = upload

const newFolderOpen = ref(false)
const uploadOpen = ref(false)
const pendingUploads = ref<PendingUpload[]>([])

const viewerOpen = ref(false)
const viewerFile = ref<MediaItem | null>(null)
const viewerBusy = ref(false)
const viewerError = ref('')
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
    ok = (await runAction(setMediaProvenance, { deps: mediaDeps(), id: f.id, provenance: save.provenance, ops: opsPort, refresh: mediaRefresh })).ok
  }
  if (ok && save.meta) {
    ok = (await runAction(setMediaMeta, { deps: mediaDeps(), id: f.id, locale: save.meta.locale, fields: save.meta.fields, ops: opsPort, refresh: mediaRefresh })).ok
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
function onConfirmPick() { emit('confirm', selectedFileIds.value) }

function queueUploads(uploads: PendingUpload[]) {
  if (error.value || !uploads.length) return
  upload.reset()
  pendingUploads.value = uploads
  uploadOpen.value = true
}
function onUpload(files: File[]) {
  queueUploads(files.map((file) => ({ file, folder: folder.value })))
}
function onConfirmUpload(provenance: Provenance) {
  uploadOpen.value = false
  const uploads = pendingUploads.value
  pendingUploads.value = []
  upload.enqueueUploads(uploads, provenance)
}

async function onCreateFolder(name: string) {
  if (error.value) return
  const r = await runAction(createFolder, { deps: mediaDeps(), path: joinFolder(folder.value, name), ops: opsPort, refresh: mediaRefresh })
  if (r.ok) newFolderOpen.value = false
}

async function onDropResult({ uploads, folders }: DropResult) {
  if (error.value) return
  for (const path of folders) {
    const r = await runAction(createFolder, { deps: mediaDeps(), path, ops: opsPort, refresh: mediaRefresh })
    if (!r.ok) return
  }
  queueUploads(uploads)
}

const draggedItems = ref<OpItem[]>([])
function onItemDragStart(item: LibraryItem, e: DragEvent) {
  const set = effectiveTargets(item, lib.isSelected, items.value.filter((i) => lib.isSelected(i)))
  draggedItems.value = set.map(toOpItem)
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-kestrel-media', '1')
  e.dataTransfer.setData('text/plain', set.map((i) => (i.type === 'file' ? i.file.filename : i.folder.path)).join('\n'))
  e.dataTransfer.effectAllowed = 'copyMove'
}
function onItemDragEnd() { draggedItems.value = [] }

const { dragActive, dropFolder, onDragEnter, onDragOver, onDragLeave, onDrop } = useMediaDnd({
  currentFolder: () => folder.value,
  onDrop: onDropResult,
  draggedItems: () => draggedItems.value,
  onMove: (opItems, dest) => {
    runAction(renameOrMove, { deps: mediaDeps(), target: { kind: 'move', targets: opItems, dest }, notify: 'toast', ops: opsPort, refresh: mediaRefresh })
  },
})

const deleteOpen = ref(false)
const deleteTargets = ref<OpItem[]>([])
const deleteFiles = ref<MediaItem[]>([])
const deleteInfo = ref<DeleteSummary | null>(null)
async function askDelete(opItems: OpItem[]) {
  opError.value = null
  deleteTargets.value = opItems
  const resolved = resolveFileTargets(opItems, files.value)
  deleteFiles.value = resolved
  const nonEmptyFolders = opItems
    .filter((t): t is Extract<OpItem, { type: 'folder' }> => t.type === 'folder' && !folderIsEmpty(t.path, folderCounts.value))
    .map((t) => t.path)
  deleteInfo.value = deleteSummary(resolved, opItems, [], nonEmptyFolders)
  deleteOpen.value = true
  const r = await runAction(previewDeleteItems, { deps: mediaDeps(), fileIds: resolved.map((f) => f.id), allowed: can('pages.manage') })
  deleteInfo.value = deleteSummary(resolved, opItems, r.ok ? (r.result ?? []) : [], nonEmptyFolders)
}
async function onConfirmDelete(recursive: boolean) {
  const targets = deleteTargets.value
  const folderPaths = targets.filter((t): t is Extract<OpItem, { type: 'folder' }> => t.type === 'folder').map((t) => t.path)
  const r = await runAction(deleteItems, {
    deps: mediaDeps(),
    files: deleteFiles.value,
    folderPaths,
    recursive,
    confirmed: true,
    ops: opsPort,
    refresh: mediaRefresh,
  })
  if (!r.ok) return
  deleteOpen.value = false
  deleteTargets.value = []
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
  if (!target) return
  const rtarget: RenameOrMoveTarget = target.type === 'file'
    ? { kind: 'file-rename', id: target.file.id, filename: name }
    : { kind: 'folder-rename', path: target.folder.path, name }
  const r = await runAction(renameOrMove, { deps: mediaDeps(), target: rtarget, notify: 'inline', ops: opsPort, refresh: mediaRefresh })
  if (!r.ok) return
  renameOpen.value = false
  renameTarget.value = null
}

const { menuItems, onContextMenu, onSelect: onMenuSelect } = useMediaContextMenu({
  items: () => items.value,
  isSelected: lib.isSelected,
  select: lib.select,
  onDelete: (opItems) => { askDelete(opItems) },
  onRename: (item) => { opError.value = null; renameTarget.value = item; renameOpen.value = true },
})

const localizedMenu = computed(() => menuItems.value.map((s) => ({
  label: t(s.labelKey, s.count != null ? { n: s.count } : undefined),
  value: s.value,
  ...(s.danger ? { danger: true } : {}),
})))

const srStatus = computed(() => {
  if (!active.value && !counts.value.done && !counts.value.error) return ''
  const msg = active.value ? `${t('media.uploading')}${counts.value.done} ${t('media.uploadUploaded')}` : `${counts.value.done} ${t('media.uploadUploaded')}`
  return counts.value.error ? `${msg}, ${counts.value.error} ${t('media.uploadFailed')}` : msg
})
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -- @click.self clears selection as a mouse-only bulk convenience; Space-toggle on each MediaGrid/MediaTable item already gives keyboard users the same end state -->
  <section class="media-library" @click.self="lib.clear()" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <KestrelMediaPathBar :folder="folder" :folders="allFolderPaths" @navigate="lib.navigate" />
    <KestrelMediaToolbar
      :view="view"
      :search="search"
      :disabled="!!error"
      @update:view="lib.setView"
      @update:search="lib.setSearch"
      @upload="onUpload"
      @new-folder="newFolderOpen = true"
    />
    <KestrelUiMenu :items="localizedMenu" @select="onMenuSelect">

      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- contextmenu fires natively via Shift+F10/the Menu key when a MediaGrid/MediaTable item has focus, so this capture handler is already keyboard-reachable -->
      <div class="media-library__items" @contextmenu.capture="onContextMenu">
        <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
        <p v-else-if="!loading && !items.length" class="media-library__empty">{{ t('media.folderEmpty') }}</p>
        <KestrelMediaGrid v-else-if="view === 'grid'" :items="items" :is-selected="isSelectedItem" :drop-target-path="dropFolder" :parent-path="parentPath" :up-label="t('media.parentFolder')" @navigate="lib.navigate" @select="onSelect" @open="onOpenItem" @dragstart="onItemDragStart" @dragend="onItemDragEnd" />
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
    <p v-if="active || counts.done || counts.error" class="media-library__status">
      <span v-if="active">{{ t('media.uploading') }}</span>{{ counts.done }} {{ t('media.uploadUploaded') }}<span v-if="counts.error">, {{ counts.error }} {{ t('media.uploadFailed') }}</span>
    </p>
    <p class="media-library__sr-status" role="status" aria-live="polite">{{ srStatus }}</p>
    <div v-if="pick" class="media-library__pickbar">
      <span>{{ selectedFileIds.length }} {{ t('media.selected') }}</span>
      <KestrelUiButton variant="primary" :disabled="!selectedFileIds.length" @click="onConfirmPick">{{ t('media.useSelected') }}</KestrelUiButton>
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
    <KestrelMediaViewer :open="viewerOpen" :file="viewerFile" :busy="viewerBusy" :error="viewerError" @update:open="(v) => { viewerOpen = v }" @save="onSaveViewer" />
    <KestrelUiAlert v-if="opError && !deleteOpen && !renameOpen && !viewerOpen && !newFolderOpen" variant="error">{{ opError }}</KestrelUiAlert>
    <KestrelMediaDeleteDialog
      :open="deleteOpen"
      :summary="deleteInfo"
      :busy="opsBusy"
      :error="opError"
      :conflict="opConflict"
      @confirm="onConfirmDelete"
      @update:open="(v) => { if (!v) { deleteOpen = false; deleteInfo = null; deleteTargets = []; deleteFiles = []; opConflict = null } }"
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
    <div v-if="dragActive && !dropFolder && !error" class="media-library__dropzone" aria-hidden="true">{{ t('media.dropToUpload') }}</div>
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
  padding: var(--space-6) 0;
  text-align: center;
}

.media-library__status {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.media-library__sr-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
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
