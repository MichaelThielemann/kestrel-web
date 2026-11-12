<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import type { Provenance, ReferenceTo } from '#kestrel-admin/types/api'
import { createFolder, renameOrMove } from '#kestrel-admin/actions/media'
import type { BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { LibraryItem } from '../utils/library'
import { joinFolder } from '../utils/library'
import type { PendingUpload } from '../utils/dnd'
import type { DropResult } from '../composables/useMediaDnd'
import { toOpItem, effectiveTargets, type OpItem } from '../utils/ops'

const props = defineProps<{ pick?: boolean; multiple?: boolean; accept?: 'image' | 'any'; initialFolder?: string; initialSelected?: string[] }>()
const emit = defineEmits<{ confirm: [string[]]; cancel: [] }>()

const lib = useMediaLibrary({ urlSync: !props.pick, accept: props.accept, initialFolder: props.pick ? props.initialFolder : undefined })
const { folder, view, search, sort, items, files, parentPath, isSelected, loading, error, allFolderPaths, counts: folderCounts, page, perPage, total, totalPages } = lib

const { t } = useT()
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

const mediaLibraryRef = ref<HTMLElement | null>(null)
const mediaUploads = useMediaLibraryUploads({ folder, view, fetchLibrary: lib.fetchLibrary, t, root: mediaLibraryRef })
const { gridTileUploads, onDismissUpload: dismissUpload, previewFor, variantResults, stalledIds, limitError, track } = mediaUploads

const pickState = useMediaPick({
  pick: props.pick === true, multiple: props.multiple === true, initialSelected: props.initialSelected ?? [],
  items, files, isSelected, select: lib.select, fresh: variantResults, track, onConfirm: (ids) => emit('confirm', ids),
})
const { isSelectedItem, selectedFileIds, hasBlockedSelection, confirming, refusal, storedIds } = pickState

function onDismissUpload(id: string) {
  dismissUpload(id)
  void nextTick(() => mediaLibraryRef.value?.focus())
}
function onCloseUploads() {
  mediaUploads.clearFinished()
  void nextTick(() => mediaLibraryRef.value?.focus())
}

const newFolderOpen = ref(false)
const uploadOpen = ref(false)
const pendingUploads = ref<PendingUpload[]>([])

let focusReturnTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (focusReturnTimer) clearTimeout(focusReturnTimer) })
const { viewerOpen, viewerFile, viewerBusy, viewerError, openViewer, closeViewer, onSaveViewer } = useMediaViewerState({
  deps, ops: opsPort, refresh: mediaRefresh, opError, saveFailed: () => t('mediaViewer.saveFailed'),
})

const { deleteOpen, deleteInfo, askDelete, onConfirmDelete, close: closeDelete } = useMediaDelete({
  deps: () => deps,
  ops: opsPort,
  refresh: mediaRefresh,
  files,
  folderCounts,
  schema,
  canDeleteTargets: (targets) => mediaCaps.canDeleteTargets(targets),
  onDeletedFromViewer: () => {
    closeViewer()
    void nextTick().then(() => {
      if (focusReturnTimer) clearTimeout(focusReturnTimer)
      focusReturnTimer = setTimeout(() => { mediaLibraryRef.value?.focus() }, 0)
    })
  },
})

function onOpenItem(item: LibraryItem) {
  if (item.type !== 'file') return
  if (props.pick) { onSelect(item, { toggle: false, range: false }); return }
  openViewer(item.file)
}

function onSelect(item: LibraryItem, mods: { toggle: boolean; range: boolean }) {
  if (props.pick) { pickState.select(item); return }
  if (mods.range) lib.range(item)
  else if (mods.toggle) lib.toggle(item)
  else lib.select(item)
}

function queueUploads(pending: PendingUpload[]) {
  if (error.value || !pending.length || !mediaCaps.canUpload.value) return
  void mediaUploads.ensureUploadLimit()
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

const { renameOpen, renameTarget, renameName, openRename, closeRename, onConfirmRename } = useMediaRename({
  deps,
  ops: opsPort,
  refresh: mediaRefresh,
  canRename: (item) => mediaCaps.canRenameTarget(item),
})

const { menuItems, onContextMenu, onSelect: onMenuSelect } = useMediaContextMenu({
  items: () => items.value,
  isSelected: lib.isSelected,
  select: lib.select,
  onDelete: (opItems) => { void askDelete(opItems) },
  onRename: openRename,
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
      :disabled="!!error"
      :can-upload="mediaCaps.canUpload.value"
      :can-create-folder="mediaCaps.canCreateFolder.value"
      :type-filter="lib.typeFilter.value"
      :accept="lib.accept"
      :result-count="total"
      @update:view="lib.setView"
      @update:search="lib.setSearch"
      @update:type-filter="lib.setTypeFilter"
      @upload="onUpload"
      @new-folder="newFolderOpen = true"
    />
    <KestrelUiMenu :items="localizedMenu" @select="onMenuSelect">

      <div class="media-library__items" @contextmenu.capture="onContextMenu">
        <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
        <p v-else-if="!loading && !items.length && !(view === 'grid' && gridTileUploads.length)" class="media-library__empty">{{ t('media.folderEmpty') }}</p>
        <KestrelMediaGrid v-else-if="view === 'grid'" :items="items" :is-selected="isSelectedItem" :drop-target-path="dropFolder" :parent-path="parentPath" :up-label="t('media.parentFolder')" :pick="pick"
          :uploads="gridTileUploads" :upload-preview="previewFor" :can-retry-upload="mediaUploads.canRetry" :variant-override="variantResults" :stalled-ids="stalledIds" :stored-ids="storedIds"
          @navigate="lib.navigate" @select="onSelect" @open="onOpenItem" @dragstart="onItemDragStart" @dragend="onItemDragEnd" @dismiss-upload="onDismissUpload" @retry-upload="mediaUploads.retry" />
        <KestrelMediaTable v-else :items="items" :is-selected="isSelectedItem" :drop-target-path="dropFolder" :sort="sort" :parent-path="parentPath" :up-label="t('media.parentFolder')" :pick="pick" :variant-override="variantResults" :stored-ids="storedIds" @navigate="lib.navigate" @select="onSelect" @open="onOpenItem" @sort="lib.setSort" @dragstart="onItemDragStart" @dragend="onItemDragEnd" />
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
    <p
      v-if="!mediaUploads.queue.value.length"
      class="media-library__follow-up"
      :class="{ 'media-library__follow-up--empty': !mediaUploads.followUp.value }"
      role="status"
    >{{ mediaUploads.followUp.value }}</p>
    <KestrelMediaUploadPanel
      v-else
      :items="mediaUploads.queue.value"
      :summary="mediaUploads.summary.value"
      :can-retry="mediaUploads.canRetry"
      :preview-for="previewFor"
      :follow-up="mediaUploads.followUp.value"
      @retry="mediaUploads.retry"
      @retry-failed="mediaUploads.retryFailed"
      @cancel="mediaUploads.cancel"
      @close="onCloseUploads"
    />
    <KestrelUiAlert v-if="limitError" variant="error">{{ limitError }}</KestrelUiAlert>
    <KestrelMediaPickBar v-if="pick" :count="selectedFileIds.length" :blocked="hasBlockedSelection" :confirming="confirming" :refusal="refusal" @confirm="pickState.confirm" @cancel="emit('cancel')" />
    <KestrelMediaUploadDialog
      :open="uploadOpen"
      :uploads="pendingUploads"
      :folder="folder"
      :max-bytes="mediaUploads.maxUploadBytes.value"
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
      @update:open="(v) => { if (!v) closeRename() }"
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
  overflow-y: auto;
}

.media-library > :not(.media-library__items) {
  flex: 0 0 auto;
}
.media-library__items {
  flex: 1 1 auto;
  min-height: min(10rem, 25svh);
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

.media-library__follow-up {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.media-library__follow-up--empty {
  margin-block-start: calc(var(--space-4) * -1);
}

.media-library__empty {
  color: var(--color-text-muted);
  font-size: var(--text-base);
  padding: var(--space-6) 0;
  text-align: center;
}
</style>
