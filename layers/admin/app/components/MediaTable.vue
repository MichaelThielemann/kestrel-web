<script setup lang="ts">
import { humanizeSize, itemKey, type LibraryItem } from '../utils/library'
import { isDisclosed, provenanceLabelKey, provenanceOrigin } from '../utils/provenance'
import type { MediaItem } from '#kestrel/types/api'

const { t, lang } = useT()
const props = defineProps<{ items: LibraryItem[]; isSelected: (item: LibraryItem) => boolean; dropTargetPath?: string | null; sort?: string; parentPath?: string | null; upLabel?: string }>()
const emit = defineEmits<{ navigate: [string]; select: [LibraryItem, { toggle: boolean; range: boolean }]; open: [LibraryItem]; dragstart: [LibraryItem, DragEvent]; dragend: []; sort: [string] }>()
const ariaSort = (field: string): 'ascending' | 'descending' | 'none' => (props.sort === field ? 'ascending' : props.sort === `-${field}` ? 'descending' : 'none')
const mods = (e: MouseEvent) => ({ toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })

function onFolder(item: LibraryItem, path: string, e: MouseEvent | KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey) emit('select', item, mods(e as MouseEvent))
  else emit('navigate', path)
}
function onFile(item: LibraryItem, e: MouseEvent | KeyboardEvent) { emit('select', item, mods(e as MouseEvent)) }
const uploaded = (f: MediaItem) => new Date(f.createdAt).toLocaleString(lang.value)
const badge = (f: MediaItem) => t(provenanceLabelKey(provenanceOrigin(f.provenance)))
const dimensions = (f: MediaItem) => (f.width != null && f.height != null ? `${f.width} × ${f.height}` : '–')
</script>

<template>
  <KestrelUiTable class="media-table">
    <template #head>
      <th scope="col" :aria-sort="ariaSort('filename')"><KestrelUiTableSort field="filename" :sort="sort ?? ''" @sort="emit('sort', $event)">{{ t('media.colName') }}</KestrelUiTableSort></th>
      <th scope="col">{{ t('media.colType') }}</th>
      <th scope="col" :aria-sort="ariaSort('size')"><KestrelUiTableSort field="size" :sort="sort ?? ''" @sort="emit('sort', $event)">{{ t('media.colSize') }}</KestrelUiTableSort></th>
      <th scope="col">{{ t('media.colDimensions') }}</th>
      <th scope="col" :aria-sort="ariaSort('createdAt')"><KestrelUiTableSort field="createdAt" :sort="sort ?? ''" @sort="emit('sort', $event)">{{ t('media.colUploaded') }}</KestrelUiTableSort></th>
    </template>
    <template #body>
      <tr v-if="parentPath != null" class="media-table__row media-table__row--up" data-test="row-folder-up"
        :data-drop-folder="parentPath" :class="{ 'is-drop-target': parentPath === dropTargetPath }"
        tabindex="0" :aria-label="upLabel"
        @click="emit('navigate', parentPath)" @keydown.enter.space.prevent="emit('navigate', parentPath)">
        <td><span aria-hidden="true"><KestrelUiIcon name="folder" :size="15" /></span> ..</td>
        <td>{{ t('media.typeFolder') }}</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr v-for="item in items" :key="itemKey(item)" class="media-table__row"
        :class="{ 'is-selected': isSelected(item), 'is-drop-target': item.type === 'folder' && item.folder.path === dropTargetPath }"
        :aria-selected="isSelected(item)" tabindex="0"
        :data-drop-folder="item.type === 'folder' ? item.folder.path : undefined"
        :data-file-id="item.type === 'file' ? item.file.id : undefined"
        :data-test="item.type === 'folder' ? `row-folder-${item.folder.path}` : `row-file-${item.file.id}`"
        draggable="true"
        @click="item.type === 'folder' ? onFolder(item, item.folder.path, $event) : onFile(item, $event)"
        @dblclick="item.type === 'file' && emit('open', item)"
        @keydown.enter.prevent="item.type === 'folder' ? onFolder(item, item.folder.path, $event) : emit('open', item)"
        @keydown.space.prevent="item.type === 'folder' ? emit('select', item, { toggle: true, range: false }) : onFile(item, $event)"
        @dragstart="(e) => emit('dragstart', item, e)"
        @dragend="emit('dragend')">
        <template v-if="item.type === 'folder'">
          <td><span aria-hidden="true"><KestrelUiIcon name="folder" :size="15" /></span> {{ item.folder.name }}</td>
          <td>{{ t('media.typeFolder') }}</td><td>—</td><td>—</td><td>—</td>
        </template>
        <template v-else>
          <td>
            {{ item.file.filename }}
            <span v-if="isDisclosed(item.file.provenance)" class="media-table__ai">{{ badge(item.file) }}</span>
          </td>
          <td>{{ item.file.contentType }}</td>
          <td>{{ humanizeSize(item.file.size) }}</td>
          <td>{{ dimensions(item.file) }}</td>
          <td>{{ uploaded(item.file) }}</td>
        </template>
      </tr>
    </template>
  </KestrelUiTable>
</template>

<style lang="scss" scoped>
.media-table__ai { margin-inline-start: var(--space-2); padding: 0 var(--space-1); border-radius: var(--radius-sm); background: var(--color-active); color: var(--color-text-muted); font-size: var(--text-xs); }
.media-table__row { cursor: pointer; }
.media-table__row.is-selected { background: var(--color-active); box-shadow: inset 2px 0 0 var(--color-primary); }
.media-table__row.is-drop-target { outline: 2px dashed var(--color-primary); outline-offset: -2px; background: var(--color-surface); }
.media-table__row:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }
</style>
