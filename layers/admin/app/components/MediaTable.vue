<script setup lang="ts">
import { humanizeSize, itemKey, rovingTabindex, type LibraryItem } from '../utils/library'
import { isDisclosed, provenanceLabelKey, provenanceOrigin } from '../utils/provenance'
import { isPickGated } from '../utils/media-insert'
import type { MediaItem } from '#kestrel-admin/types/api'
import type { VariantWatchEntry } from '../composables/useVariantWatch'
import type { MenuItem } from '../utils/ops'

const { t, lang } = useT()
const props = defineProps<{
  items: LibraryItem[]
  isSelected: (item: LibraryItem) => boolean
  dropTargetPath?: string | null
  sort?: string
  parentPath?: string | null
  upLabel?: string
  pick?: boolean
  variantOverride?: ReadonlyMap<string, VariantWatchEntry>
  storedIds?: ReadonlySet<string>
  rovingKey?: string | null
  checkboxes?: boolean
  selecting?: boolean
  isSelectable?: (item: LibraryItem) => boolean
  allSelected?: boolean
  someSelected?: boolean
  tileMenu?: MenuItem[] | null
}>()
const emit = defineEmits<{ navigate: [string]; select: [LibraryItem, { toggle: boolean; range: boolean }]; selectAll: [boolean]; open: [LibraryItem]; dragstart: [LibraryItem, DragEvent]; dragend: []; sort: [string]; tileMenu: [LibraryItem, string] }>()
const ariaSort = (field: string): 'ascending' | 'descending' | 'none' => (props.sort === field ? 'ascending' : props.sort === `-${field}` ? 'descending' : 'none')
const mods = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => ({ toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })
const tabindexFor = (key: string) => rovingTabindex(key, props.rovingKey)
const hasCheckbox = (item: LibraryItem) => props.checkboxes === true && (props.isSelectable?.(item) ?? true)
const name = (item: LibraryItem) => (item.type === 'folder' ? item.folder.name : item.file.filename)
const MENU_KEYS = new Set([' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])
function keepMenuKeys(e: KeyboardEvent) {
  if (MENU_KEYS.has(e.key)) e.stopPropagation()
}

function onFolder(item: LibraryItem, path: string, e: MouseEvent | KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || (props.selecting && e instanceof MouseEvent)) emit('select', item, mods(e))
  else emit('navigate', path)
}
function gatedFile(item: LibraryItem): boolean {
  return props.pick === true && item.type === 'file' && isPickGated(item.file.id, props.variantOverride?.get(item.file.id) ?? item.file, props.storedIds)
}
function blockedFile(item: LibraryItem): boolean {
  return gatedFile(item) && !props.isSelected(item)
}
function onFile(item: LibraryItem, e: MouseEvent | KeyboardEvent) {
  if (blockedFile(item)) return
  emit('select', item, mods(e))
}
function onFileOpen(item: LibraryItem) {
  if (blockedFile(item)) return
  emit('open', item)
}
const uploaded = (f: MediaItem) => new Date(f.createdAt).toLocaleString(lang.value)
const badge = (f: MediaItem) => t(provenanceLabelKey(provenanceOrigin(f.provenance)))
const dimensions = (f: MediaItem) => (f.width != null && f.height != null ? `${f.width} × ${f.height}` : '–')
</script>

<template>
  <KestrelUiTable class="media-table">
    <template #head>
      <th v-if="checkboxes" class="ui-table__col--select" scope="col">
        <KestrelUiCheckbox standalone :model-value="!!allSelected" :indeterminate="!!someSelected" :aria-label="t('media.selection.selectAllPage')"
          @update:model-value="(v) => emit('selectAll', v)" />
      </th>
      <th scope="col" :aria-sort="ariaSort('filename')"><KestrelUiTableSort field="filename" :sort="sort ?? ''" @sort="emit('sort', $event)">{{ t('media.colName') }}</KestrelUiTableSort></th>
      <th scope="col">{{ t('media.colType') }}</th>
      <th scope="col" :aria-sort="ariaSort('size')"><KestrelUiTableSort field="size" :sort="sort ?? ''" @sort="emit('sort', $event)">{{ t('media.colSize') }}</KestrelUiTableSort></th>
      <th scope="col">{{ t('media.colDimensions') }}</th>
      <th scope="col" :aria-sort="ariaSort('createdAt')"><KestrelUiTableSort field="createdAt" :sort="sort ?? ''" @sort="emit('sort', $event)">{{ t('media.colUploaded') }}</KestrelUiTableSort></th>
      <th v-if="tileMenu?.length" class="ui-table__col--actions" scope="col"><span class="ui-table__vh">{{ t('a11y.rowActions') }}</span></th>
    </template>
    <template #body>
      <tr v-if="parentPath != null" class="media-table__row media-table__row--up" data-test="row-folder-up"
        :data-drop-folder="parentPath" :class="{ 'is-drop-target': parentPath === dropTargetPath }"
        data-roving-key="up" :tabindex="tabindexFor('up')" :aria-label="upLabel"
        @click="emit('navigate', parentPath)" @keydown.enter.space.prevent="emit('navigate', parentPath)">
        <td v-if="checkboxes" class="ui-table__col--select"></td>
        <td><span aria-hidden="true"><KestrelUiIcon name="folder" :size="15" /></span> ..</td>
        <td>{{ t('media.typeFolder') }}</td><td>—</td><td>—</td><td>—</td>
        <td v-if="tileMenu?.length"></td>
      </tr>
      <tr v-for="item in items" :key="itemKey(item)" class="media-table__row"
        :class="{ 'is-selected': isSelected(item), 'is-drop-target': item.type === 'folder' && item.folder.path === dropTargetPath, 'is-blocked': item.type === 'file' && blockedFile(item) }"
        :aria-disabled="(item.type === 'file' && blockedFile(item)) || undefined"
        :data-roving-key="itemKey(item)" :tabindex="tabindexFor(itemKey(item))"
        :data-drop-folder="item.type === 'folder' ? item.folder.path : undefined"
        :data-file-id="item.type === 'file' ? item.file.id : undefined"
        :data-test="item.type === 'folder' ? `row-folder-${item.folder.path}` : `row-file-${item.file.id}`"
        draggable="true"
        @click="item.type === 'folder' ? onFolder(item, item.folder.path, $event) : onFile(item, $event)"
        @dblclick="item.type === 'file' && onFileOpen(item)"
        @keydown.enter.prevent="item.type === 'folder' ? onFolder(item, item.folder.path, $event) : onFileOpen(item)"
        @dragstart="(e) => emit('dragstart', item, e)"
        @dragend="emit('dragend')">
        <td v-if="checkboxes" class="ui-table__col--select" @click.stop @dblclick.stop>
          <KestrelMediaItemCheck v-if="hasCheckbox(item)" :selected="isSelected(item)" :disabled="item.type === 'file' && blockedFile(item)"
            :label="t('media.selection.selectItem', { name: name(item) })" @select="(m) => emit('select', item, m)" />
        </td>
        <template v-if="item.type === 'folder'">
          <td><span aria-hidden="true"><KestrelUiIcon name="folder" :size="15" /></span> {{ item.folder.name }}</td>
          <td>{{ t('media.typeFolder') }}</td><td>—</td><td>—</td><td>—</td>
          <td v-if="tileMenu?.length"></td>
        </template>
        <template v-else>
          <td>
            {{ item.file.filename }}
            <KestrelUiBadge v-if="!pick && isDisclosed(item.file.provenance)" class="media-table__ai">{{ badge(item.file) }}</KestrelUiBadge>
            <span v-if="gatedFile(item)" class="media-table__processing">{{ t('media.pick.processing') }}</span>
          </td>
          <td>{{ item.file.contentType }}</td>
          <td>{{ humanizeSize(item.file.size) }}</td>
          <td>{{ dimensions(item.file) }}</td>
          <td>{{ uploaded(item.file) }}</td>
          <td v-if="tileMenu?.length" class="ui-table__col--actions" @click.stop @dblclick.stop @keydown="keepMenuKeys">
            <KestrelUiActionMenu :items="tileMenu" :label="t('media.menu.more', { name: item.file.filename })" trigger-class="ui-button--icon ui-button--icon-sm"
              :trigger-tabindex="tabindexFor(itemKey(item))" @select="(value: string) => emit('tileMenu', item, value)"><KestrelUiIcon name="more-horizontal" :size="16" /></KestrelUiActionMenu>
          </td>
        </template>
      </tr>
    </template>
  </KestrelUiTable>
</template>

<style lang="scss" scoped>
.media-table__ai { margin-inline-start: var(--space-2); }
.media-table__row { cursor: pointer; }
.media-table__row:not(.is-selected):hover > :is(.ui-table__col--select, .ui-table__col--actions) { background: linear-gradient(var(--color-hover), var(--color-hover)), var(--color-bg); }
.media-table__row.is-selected > td { background: var(--color-active); }
.media-table__row.is-selected > td:first-child { box-shadow: inset 2px 0 0 var(--color-primary); }
.media-table__row.is-drop-target { outline: 2px dashed var(--color-primary); outline-offset: -2px; background: var(--color-surface); }
.media-table__row.is-blocked { cursor: not-allowed; opacity: 0.6; }
.media-table__row:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }
.media-table__processing { margin-inline-start: var(--space-2); font-size: var(--text-xs); color: var(--color-text-muted); }
</style>
