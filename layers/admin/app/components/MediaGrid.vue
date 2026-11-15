<script setup lang="ts">
import type { UploadItem } from '../composables/useMediaUpload'
import type { VariantWatchEntry } from '../composables/useVariantWatch'
import { itemKey, rovingTabindex, type LibraryItem } from '../utils/library'
import { isPickGated } from '../utils/media-insert'
import { variantChip } from '../utils/variant-state'
import type { MenuItem } from '../utils/ops'

const props = defineProps<{
  items: LibraryItem[]
  isSelected: (item: LibraryItem) => boolean
  dropTargetPath?: string | null
  parentPath?: string | null
  upLabel?: string
  uploads?: readonly UploadItem[]
  uploadPreview?: (id: string) => string | undefined
  canRetryUpload?: (item: UploadItem) => boolean
  variantOverride?: ReadonlyMap<string, VariantWatchEntry>
  stalledIds?: ReadonlySet<string>
  storedIds?: ReadonlySet<string>
  pick?: boolean
  rovingKey?: string | null
  checkboxes?: boolean
  selecting?: boolean
  isSelectable?: (item: LibraryItem) => boolean
  tileMenu?: MenuItem[] | null
}>()
const emit = defineEmits<{
  navigate: [string]
  select: [LibraryItem, { toggle: boolean; range: boolean }]
  open: [LibraryItem, pointer?: boolean]
  dragstart: [LibraryItem, DragEvent]
  dragend: []
  dismissUpload: [string]
  retryUpload: [string]
  tileMenu: [LibraryItem, string]
}>()
const { t } = useT()
const { has: hasFeature } = useFeatures()
const mods = (e: MouseEvent) => ({ toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })
const tabindexFor = (key: string) => rovingTabindex(key, props.rovingKey)
const hasCheckbox = (item: LibraryItem) => props.checkboxes === true && (props.isSelectable?.(item) ?? true)

function onFolder(item: LibraryItem, path: string, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || props.selecting) emit('select', item, mods(e))
  else emit('navigate', path)
}
function gatedFile(item: LibraryItem): boolean {
  return props.pick === true && item.type === 'file' && isPickGated(item.file.id, props.variantOverride?.get(item.file.id) ?? item.file, props.storedIds)
}
function blockedFile(item: LibraryItem): boolean {
  return gatedFile(item) && !props.isSelected(item)
}
function onFile(item: LibraryItem, e: MouseEvent) {
  if (blockedFile(item) || (e.detail > 1 && !props.pick)) return
  emit('select', item, mods(e))
}
function onFileOpen(item: LibraryItem, pointer = false) {
  if (blockedFile(item)) return
  emit('open', item, pointer)
}
function uploadChipFor(upload: UploadItem) {
  return upload.result ? variantChip(props.variantOverride?.get(upload.result.id), props.stalledIds?.has(upload.result.id) === true) : null
}
function uploadProcessing(upload: UploadItem): boolean {
  const result = upload.result
  if (upload.status !== 'done' || !result) return false
  if (!hasFeature('images') || !result.contentType.startsWith('image/')) return false
  return props.variantOverride?.get(result.id)?.available !== true
}
</script>

<template>
  <ul class="media-grid" :class="{ 'is-selecting': selecting }">
    <li v-if="parentPath != null" class="media-grid__cell">
      <KestrelUiButton variant="bare" class="media-grid__tile media-grid__tile--folder" data-test="folder-up"
        data-roving-key="up" :tabindex="tabindexFor('up')"
        :data-drop-folder="parentPath" :class="{ 'is-drop-target': parentPath === dropTargetPath }"
        :aria-label="upLabel" @click="emit('navigate', parentPath)">
        <span class="media-grid__thumb-wrap">
          <span class="media-grid__thumb media-grid__thumb--folder" aria-hidden="true"><KestrelUiIcon name="folder" :size="40" /></span>
        </span>
        <span class="media-grid__name">..</span>
      </KestrelUiButton>
    </li>
    <template v-for="item in items" :key="itemKey(item)">
      <li v-if="item.type === 'folder'" class="media-grid__cell">
        <span v-if="hasCheckbox(item)" class="media-grid__check">
          <KestrelMediaItemCheck :selected="isSelected(item)" :label="t('media.selection.selectItem', { name: item.folder.name })" @select="(m) => emit('select', item, m)" />
        </span>
        <KestrelUiButton variant="bare" class="media-grid__tile media-grid__tile--folder"
          :data-test="`folder-${item.folder.path}`" :aria-pressed="isSelected(item)"
          :data-drop-folder="item.folder.path"
          :data-roving-key="itemKey(item)" :tabindex="tabindexFor(itemKey(item))"
          :class="{ 'is-selected': isSelected(item), 'is-drop-target': item.folder.path === dropTargetPath }"
          draggable="true"
          @click="onFolder(item, item.folder.path, $event)"
          @keydown.enter.prevent="emit('navigate', item.folder.path)"
          @dragstart="(e: DragEvent) => emit('dragstart', item, e)"
          @dragend="emit('dragend')">
          <span class="media-grid__thumb-wrap">
            <span class="media-grid__thumb media-grid__thumb--folder" aria-hidden="true"><KestrelUiIcon name="folder" :size="40" /></span>
          </span>
          <span class="media-grid__name">{{ item.folder.name }}</span>
        </KestrelUiButton>
      </li>
    </template>
    <li v-for="upload in uploads" :key="`upload:${upload.id}`" class="media-grid__cell">
      <KestrelMediaUploadTile
        :item="upload"
        :preview="uploadPreview?.(upload.id)"
        :chip-state="uploadChipFor(upload)?.state"
        :chip-stalled="uploadChipFor(upload)?.stalled"
        :chip-done="uploadChipFor(upload)?.done"
        :chip-total="uploadChipFor(upload)?.total"
        :processing="uploadProcessing(upload)"
        :retryable="canRetryUpload?.(upload)"
        @dismiss="emit('dismissUpload', $event)"
        @retry="emit('retryUpload', $event)"
      />
    </li>
    <template v-for="item in items" :key="itemKey(item)">
      <li v-if="item.type === 'file'" class="media-grid__cell">
        <span v-if="hasCheckbox(item)" class="media-grid__check">
          <KestrelMediaItemCheck :selected="isSelected(item)" :disabled="blockedFile(item)" :label="t('media.selection.selectItem', { name: item.file.filename })" @select="(m) => emit('select', item, m)" />
        </span>
        <KestrelUiButton variant="bare" class="media-grid__tile media-grid__tile--file"
          :data-test="`file-${item.file.id}`" :aria-pressed="isSelected(item)"
          :aria-disabled="blockedFile(item) || undefined"
          :data-roving-key="itemKey(item)" :tabindex="tabindexFor(itemKey(item))"
          :data-file-id="item.file.id"
          :class="{ 'is-selected': isSelected(item), 'is-blocked': blockedFile(item) }"
          draggable="true"
          @click="onFile(item, $event)"
          @dblclick="onFileOpen(item, true)"
          @keydown.enter.prevent="onFileOpen(item)"
          @dragstart="(e: DragEvent) => emit('dragstart', item, e)"
          @dragend="emit('dragend')">
          <KestrelMediaGridFile :file="item.file" :fresh="variantOverride?.get(item.file.id)" :stalled="stalledIds?.has(item.file.id)" :gated="gatedFile(item)" :pick="pick" />
        </KestrelUiButton>
        <span v-if="tileMenu?.length" class="media-grid__menu">
          <KestrelUiActionMenu :items="tileMenu" :label="t('media.menu.more', { name: item.file.filename })" trigger-class="ui-button--icon ui-button--icon-sm media-grid__menu-trigger"
            :trigger-tabindex="tabindexFor(itemKey(item))" @select="(value: string) => emit('tileMenu', item, value)"><KestrelUiIcon name="more-horizontal" :size="16" /></KestrelUiActionMenu>
        </span>
      </li>
    </template>
  </ul>
</template>

<style lang="scss" scoped>
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: var(--space-3); list-style: none; padding: 0; margin: 0; }
.media-grid__cell { position: relative; }
.media-grid__check,
.media-grid__menu {
  position: absolute;
  top: var(--space-1);
  left: var(--space-1);
  z-index: 1;
  display: inline-flex;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}
.media-grid__check { border-radius: var(--radius-sm); }
.media-grid__menu { border-radius: var(--radius-full); }
.media-grid__menu :deep(.media-grid__menu-trigger) { min-inline-size: 1.75rem; min-block-size: 1.75rem; }
.media-grid__tile { display: flex; flex-direction: column; gap: var(--space-2); width: 100%; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2); cursor: pointer; text-align: left; }
.media-grid__tile:hover { border-color: var(--color-border-strong); }

.media-grid__tile.is-selected { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
.media-grid__tile.is-drop-target { outline: 2px dashed var(--color-primary); outline-offset: -2px; background: var(--color-surface); }
.media-grid__tile.is-blocked { cursor: not-allowed; opacity: 0.6; }
.media-grid__tile:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--color-surface), inset 0 0 0 4px var(--color-focus); }
.media-grid__tile.is-selected:focus-visible { box-shadow: inset 0 0 0 1px var(--color-primary), inset 0 0 0 3px var(--color-surface), inset 0 0 0 5px var(--color-focus); }
.media-grid__thumb-wrap { position: relative; width: 100%; }
.media-grid__thumb { aspect-ratio: 1; width: 100%; border-radius: var(--radius-sm); background: var(--color-bg); display: block; }
.media-grid__thumb--folder { display: grid; place-items: center; color: var(--color-text-subtle); }
.media-grid__name { font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
