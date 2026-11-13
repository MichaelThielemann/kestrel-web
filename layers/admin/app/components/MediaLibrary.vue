<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import type { ReferenceTo } from '#kestrel-admin/types/api'
import type { BusyPort, RefreshPort } from '#kestrel-admin/actions/types'
import { itemKey, type LibraryItem } from '../utils/library'
import { toOpItem } from '../utils/ops'
import { isPickGated } from '../utils/media-insert'
import type { SelectMods } from '../composables/useMediaSelection'
import { gridColumns } from '../composables/useMediaKeyboard'

const props = defineProps<{ pick?: boolean; multiple?: boolean; accept?: 'image' | 'any'; initialFolder?: string; initialSelected?: string[] }>()
const emit = defineEmits<{ confirm: [string[]]; cancel: [] }>()

const lib = useMediaLibrary({ urlSync: !props.pick, accept: props.accept, initialFolder: props.pick ? props.initialFolder : undefined })
const { folder, view, search, sort, items, files, parentPath, loading, error, allFolderPaths, counts: folderCounts, page, perPage, total, totalPages } = lib

const { t } = useT()
const deps = useActionDeps()
const mediaCaps = useMediaCapabilities()
const trashCount = useMediaTrashCount()

const mediaRefresh: RefreshPort = async () => { await Promise.all([lib.fetchLibrary(), mode === 'library' ? trashCount.refresh() : undefined]) }
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
const itemsRef = ref<HTMLElement | null>(null)
const listedIds = computed<ReadonlySet<string>>(() => new Set(files.value.map((f) => f.id)))
const mediaUploads = useMediaLibraryUploads({ folder, view, listedIds, fetchLibrary: lib.fetchLibrary, t, root: mediaLibraryRef })
const { gridTileUploads, onDismissUpload: dismissUpload, previewFor, variantResults, stalledIds, limitError, track } = mediaUploads

const mode = !props.pick ? 'library' : props.multiple ? 'pick-multi' : 'pick-single'
const storedIds: ReadonlySet<string> = new Set(props.initialSelected ?? [])
const selection = useMediaSelection({
  mode, items, initial: props.initialSelected,
  isBlocked: (item) => mode !== 'library' && item.type === 'file' && isPickGated(item.file.id, variantResults.value.get(item.file.id) ?? item.file, storedIds),
})
const canHoldSelection = (item: LibraryItem) => mode === 'library' || item.type === 'file'
const showBar = computed(() => mode !== 'pick-single' && selection.count.value > 0)

const pickState = useMediaPick({
  pick: props.pick === true, initialSelected: props.initialSelected ?? [],
  files, selection, fresh: variantResults, track, onConfirm: (ids) => emit('confirm', ids),
})
const { selectedFileIds, hasBlockedSelection, confirming, refusal } = pickState

function focusLibrary() { void nextTick(() => mediaLibraryRef.value?.focus()) }
function onDismissUpload(id: string) { dismissUpload(id); focusLibrary() }
function onCloseUploads() { mediaUploads.clearFinished(); focusLibrary() }

let focusReturnTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (focusReturnTimer) clearTimeout(focusReturnTimer) })
const { viewerOpen, viewerFile, viewerBusy, viewerError, openViewer, closeViewer, onSaveViewer } = useMediaViewerState({
  deps, ops: opsPort, refresh: mediaRefresh, opError, saveFailed: () => t('mediaViewer.saveFailed'),
})

const removal = useMediaBulkActions({
  deps: () => deps, ops: opsPort, refresh: mediaRefresh, files, folderCounts,
  canDeleteTargets: (targets) => mediaCaps.canDeleteTargets(targets),
  onRemoved: (ids) => pickState.forget(ids),
  onSettled: () => { returnFocus(() => keyboard.focusActive() || mediaLibraryRef.value?.focus()) },
  onDeletedFromViewer: () => {
    closeViewer()
    returnFocus(() => mediaLibraryRef.value?.focus())
  },
})
const askRemove = removal.askRemove

function returnFocus(run: () => void) {
  void nextTick().then(() => {
    if (focusReturnTimer) clearTimeout(focusReturnTimer)
    focusReturnTimer = setTimeout(run, 0)
  })
}

const rovingKeys = computed(() => [...(parentPath.value != null ? ['up'] : []), ...items.value.map(itemKey)])
const itemByKey = computed(() => new Map(items.value.map((item) => [itemKey(item), item])))
const keyboard = useMediaKeyboard({
  root: itemsRef, keys: rovingKeys, selection, itemFor: (key) => itemByKey.value.get(key),
  columns: () => (view.value === 'grid' ? gridColumns(itemsRef.value?.querySelector('.media-grid')) : 1),
  onDelete: (targets) => { void askRemove(targets) },
})

function onOpenItem(item: LibraryItem) {
  if (item.type !== 'file') return
  if (props.pick) { onSelect(item, { toggle: false, range: false }); return }
  openViewer(item.file)
}

function onSelect(item: LibraryItem, mods: SelectMods) {
  pickState.resetNotice()
  selection.activate(item, mods)
}

function onBackgroundClick() { if (mode !== 'pick-multi') selection.clear() }

const intake = useMediaIntake({
  deps, ops: opsPort, refresh: mediaRefresh, folder, error,
  canUpload: () => mediaCaps.canUpload.value, canCreateFolder: () => mediaCaps.canCreateFolder.value,
  ensureUploadLimit: mediaUploads.ensureUploadLimit, enqueueUploads: mediaUploads.enqueueUploads,
})
const { uploadOpen, newFolderOpen, pendingUploads } = intake

const { dragActive, dropFolder, onDragEnter, onDragOver, onDragLeave, onDrop, onItemDragStart, onItemDragEnd } = useMediaLibraryDrag({
  deps, ops: opsPort, refresh: mediaRefresh, selection, currentFolder: () => folder.value,
  canMoveTargets: (targets) => mediaCaps.canMoveTargets(targets), onDrop: (result) => { void intake.onDropResult(result) },
})

function onViewerDelete() { if (viewerFile.value) void askRemove([{ type: 'file', id: viewerFile.value.id }], 'viewer') }

const { renameOpen, renameTarget, renameName, openRename, closeRename, onConfirmRename } = useMediaRename({
  deps, ops: opsPort, refresh: mediaRefresh, canRename: (item) => mediaCaps.canRenameTarget(item),
})

const { menuItems, onContextMenu, onSelect: onMenuSelect } = useMediaContextMenu({
  items: () => items.value,
  isSelected: selection.isSelected,
  select: (item) => { if (mode === 'library') selection.select(item) },
  onDelete: (opItems) => { void askRemove(opItems) },
  onRename: openRename,
  trash: () => removal.trashing.value,
  canRename: (item) => mediaCaps.canRenameTarget(item),
  canDelete: (targets) => mediaCaps.canDeleteTargets(targets),
})
const localizedMenu = computed(() => menuItems.value.map((s) => ({
  label: t(s.labelKey, s.count != null ? { n: s.count } : undefined), value: s.value, ...(s.danger ? { danger: true } : {}),
})))

const tileMenu = computed(() => (mode === 'pick-single' && mediaCaps.canDeleteFile.value
  ? [{ label: t(removal.trashing.value ? 'media.menu.trash' : 'media.menu.delete'), value: 'delete', danger: true }]
  : null))
function onTileMenu(item: LibraryItem, value: string) { if (value === 'delete') void askRemove([toOpItem(item)]) }

onMounted(() => { if (mode === 'library') void trashCount.refresh() })

defineExpose({ clearSelection: selection.clear })
</script>

<template>
  <section ref="mediaLibraryRef" class="media-library" tabindex="-1" @click.self="onBackgroundClick" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <KestrelMediaPathBar :folder="folder" :folders="allFolderPaths" @navigate="lib.navigate">
      <template v-if="mode === 'library' && trashCount.count.value !== null" #end>
        <KestrelUiButton variant="ghost" size="sm" icon="trash" to="/admin/media?trash=1" data-test="media-trash-entry">{{ t('media.trash.entry', { n: trashCount.count.value }) }}</KestrelUiButton>
      </template>
    </KestrelMediaPathBar>
    <KestrelMediaToolbar
      v-if="mode !== 'library' || !showBar"
      :view="view" :search="search" :disabled="!!error"
      :can-upload="mediaCaps.canUpload.value" :can-create-folder="mediaCaps.canCreateFolder.value"
      :type-filter="lib.typeFilter.value" :accept="lib.accept"
      :result-count="total + mediaUploads.unlistedDone.value" :quiet-count="mediaUploads.active.value"
      @update:view="lib.setView" @update:search="lib.setSearch" @update:type-filter="lib.setTypeFilter"
      @upload="intake.onUpload" @new-folder="newFolderOpen = true"
    />
    <KestrelMediaSelectionBar
      v-if="showBar"
      :count="selection.count.value" :page-count="selection.selectableCount.value" :all-selected="selection.allSelected.value"
      :can-delete="mediaCaps.canDeleteTargets(selection.selectedTargets())" :trash="removal.trashing.value" :busy="opsBusy"
      @select-all="selection.selectAll" @clear="selection.clear" @delete="askRemove(selection.selectedTargets())"
    />
    <KestrelUiMenu :items="localizedMenu" @select="onMenuSelect">
      <div ref="itemsRef" class="media-library__items" @contextmenu.capture="onContextMenu" @keydown="keyboard.onKeydown" @focusin="keyboard.onFocusin">
        <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
        <p v-else-if="!loading && !items.length && !(view === 'grid' && gridTileUploads.length)" class="media-library__empty">{{ t('media.folderEmpty') }}</p>
        <KestrelMediaGrid v-else-if="view === 'grid'" :items="items" :is-selected="selection.isSelected" :drop-target-path="dropFolder" :parent-path="parentPath" :up-label="t('media.parentFolder')" :pick="pick"
          :uploads="gridTileUploads" :upload-preview="previewFor" :can-retry-upload="mediaUploads.canRetry" :variant-override="variantResults" :stalled-ids="stalledIds" :stored-ids="storedIds"
          :roving-key="keyboard.activeKey.value" :checkboxes="mode !== 'pick-single'" :selecting="mode === 'library' && selection.count.value > 0" :is-selectable="canHoldSelection" :tile-menu="tileMenu"
          @navigate="lib.navigate" @select="onSelect" @open="onOpenItem" @dragstart="onItemDragStart" @dragend="onItemDragEnd" @dismiss-upload="onDismissUpload" @retry-upload="mediaUploads.retry" @tile-menu="onTileMenu" />
        <KestrelMediaTable v-else :items="items" :is-selected="selection.isSelected" :drop-target-path="dropFolder" :sort="sort" :parent-path="parentPath" :up-label="t('media.parentFolder')" :pick="pick" :variant-override="variantResults" :stored-ids="storedIds"
          :roving-key="keyboard.activeKey.value" :checkboxes="mode !== 'pick-single'" :selecting="mode === 'library' && selection.count.value > 0" :is-selectable="canHoldSelection"
          :all-selected="selection.allSelected.value" :some-selected="selection.someSelected.value" :tile-menu="tileMenu"
          @tile-menu="onTileMenu" @navigate="lib.navigate" @select="onSelect" @select-all="(on) => (on ? selection.selectAll() : selection.deselectAll())" @open="onOpenItem" @sort="lib.setSort" @dragstart="onItemDragStart" @dragend="onItemDragEnd" />
      </div>
    </KestrelUiMenu>
    <KestrelCollectionListPager v-if="totalPages > 1" :page="page" :total-pages="totalPages" :total="total" :per-page="perPage" @update:page="lib.setPage" @update:per-page="lib.setPerPage" />
    <p
      v-if="!mediaUploads.queue.value.length"
      class="media-library__follow-up"
      :class="{ 'media-library__follow-up--empty': !mediaUploads.followUp.value }"
      role="status"
    >{{ mediaUploads.followUp.value }}</p>
    <KestrelMediaUploadPanel
      v-else
      :items="mediaUploads.queue.value" :summary="mediaUploads.summary.value" :can-retry="mediaUploads.canRetry" :preview-for="previewFor" :follow-up="mediaUploads.followUp.value"
      @retry="mediaUploads.retry" @retry-failed="mediaUploads.retryFailed" @cancel="mediaUploads.cancel" @close="onCloseUploads"
    />
    <KestrelUiAlert v-if="limitError" variant="error">{{ limitError }}</KestrelUiAlert>
    <KestrelMediaPickBar v-if="pick" :count="selectedFileIds.length" :blocked="hasBlockedSelection" :confirming="confirming" :refusal="refusal" @confirm="pickState.confirm" @cancel="emit('cancel')" />
    <KestrelMediaUploadDialog :open="uploadOpen" :uploads="pendingUploads" :folder="folder" :max-bytes="mediaUploads.maxUploadBytes.value" @confirm="intake.onConfirmUpload" @update:open="intake.onUploadOpen" />
    <KestrelMediaNewFolderDialog v-model:open="newFolderOpen" :busy="opsBusy" :error="opError" @create="intake.onCreateFolder" />
    <KestrelMediaViewer
      :open="viewerOpen" :file="viewerFile" :can-save="mediaCaps.canRenameFile.value" :can-delete="mediaCaps.canDeleteFile.value" :busy="viewerBusy" :error="viewerError"
      @update:open="(v) => { viewerOpen = v }" @save="onSaveViewer" @delete="onViewerDelete"
    />
    <KestrelUiAlert v-if="opError && !removal.open.value && !renameOpen && !viewerOpen && !newFolderOpen" variant="error">{{ opError }}</KestrelUiAlert>
    <KestrelMediaDeleteDialog
      :state="removal.state.value" :busy="opsBusy" :error="opError" :conflict="opConflict"
      @confirm="removal.confirm" @cancel="() => { removal.cancel(); if (!opsBusy) opConflict = null }"
    />
    <KestrelMediaRenameDialog
      :open="renameOpen" :name="renameName" :kind="renameTarget?.type" :busy="opsBusy" :error="opError"
      @rename="onConfirmRename" @update:open="(v) => { if (!v) closeRename() }"
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
