<script setup lang="ts">
import type { MediaItem } from '#kestrel-admin/types/api'
import { itemKey, humanizeSize, type LibraryItem } from '../utils/library'
import { isDisclosed, provenanceLabelKey, provenanceOrigin } from '../utils/provenance'

defineProps<{ items: LibraryItem[]; isSelected: (item: LibraryItem) => boolean; dropTargetPath?: string | null; parentPath?: string | null; upLabel?: string }>()
const emit = defineEmits<{ navigate: [string]; select: [LibraryItem, { toggle: boolean; range: boolean }]; open: [LibraryItem]; dragstart: [LibraryItem, DragEvent]; dragend: [] }>()
const { t } = useT()
const mods = (e: MouseEvent) => ({ toggle: e.ctrlKey || e.metaKey, range: e.shiftKey })

function onFolder(item: LibraryItem, path: string, e: MouseEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey) emit('select', item, mods(e))
  else emit('navigate', path)
}
function onFile(item: LibraryItem, e: MouseEvent) { emit('select', item, mods(e)) }
const ext = (filename: string) => (filename.split('.').pop() ?? '').toUpperCase()
const badge = (f: MediaItem) => t(provenanceLabelKey(provenanceOrigin(f.provenance)))
</script>

<template>
  <ul class="media-grid">
    <li v-if="parentPath != null" class="media-grid__cell">

      <button type="button" class="media-grid__tile media-grid__tile--folder" data-test="folder-up"
        :data-drop-folder="parentPath" :class="{ 'is-drop-target': parentPath === dropTargetPath }"
        :aria-label="upLabel" @click="emit('navigate', parentPath)">
        <span class="media-grid__thumb-wrap">
          <span class="media-grid__thumb media-grid__thumb--folder" aria-hidden="true"><KestrelUiIcon name="folder" :size="40" /></span>
        </span>
        <span class="media-grid__name">..</span>
      </button>
    </li>
    <li v-for="item in items" :key="itemKey(item)" class="media-grid__cell">
      <button v-if="item.type === 'folder'" type="button" class="media-grid__tile media-grid__tile--folder"
        :data-test="`folder-${item.folder.path}`" :aria-pressed="isSelected(item)"
        :data-drop-folder="item.folder.path"
        :class="{ 'is-selected': isSelected(item), 'is-drop-target': item.folder.path === dropTargetPath }"
        draggable="true"
        @click="onFolder(item, item.folder.path, $event)"
        @keydown.space.prevent="emit('select', item, { toggle: true, range: false })"
        @dragstart="(e) => emit('dragstart', item, e)"
        @dragend="emit('dragend')">
        <span class="media-grid__thumb-wrap">
          <span class="media-grid__thumb media-grid__thumb--folder" aria-hidden="true"><KestrelUiIcon name="folder" :size="40" /></span>
        </span>
        <span class="media-grid__name">{{ item.folder.name }}</span>
      </button>
      <button v-else type="button" class="media-grid__tile media-grid__tile--file"
        :data-test="`file-${item.file.id}`" :aria-pressed="isSelected(item)"
        :data-file-id="item.file.id"
        :class="{ 'is-selected': isSelected(item) }"
        draggable="true"
        @click="onFile(item, $event)"
        @dblclick="emit('open', item)"
        @keydown.enter.prevent="emit('open', item)"
        @dragstart="(e) => emit('dragstart', item, e)"
        @dragend="emit('dragend')">
        <span class="media-grid__thumb-wrap">
          <KestrelMediaThumb
            v-if="item.file.contentType.startsWith('image/')"
            :id="item.file.id"
            class="media-grid__thumb"
            :content-type="item.file.contentType"
            :alt="item.file.alt ?? item.file.filename" />
          <span v-else class="media-grid__badge" aria-hidden="true">{{ ext(item.file.filename) }}</span>
          <span v-if="isDisclosed(item.file.provenance)" class="media-grid__ai">{{ badge(item.file) }}</span>
          <span class="media-grid__meta" aria-hidden="true">{{ humanizeSize(item.file.size) }}</span>
        </span>
        <span class="media-grid__name">{{ item.file.filename }}</span>
      </button>
    </li>
  </ul>
</template>

<style lang="scss" scoped>
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: var(--space-3); list-style: none; padding: 0; margin: 0; }
.media-grid__tile { display: flex; flex-direction: column; gap: var(--space-2); width: 100%; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2); cursor: pointer; text-align: left; }
.media-grid__tile:hover { border-color: var(--color-border-strong); }

.media-grid__tile.is-selected { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
.media-grid__tile.is-drop-target { outline: 2px dashed var(--color-primary); outline-offset: -2px; background: var(--color-surface); }
.media-grid__tile:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }
.media-grid__thumb-wrap { position: relative; width: 100%; }
.media-grid__thumb { aspect-ratio: 1; width: 100%; object-fit: cover; border-radius: var(--radius-sm); background: var(--color-bg); display: block; }
.media-grid__thumb--folder { display: grid; place-items: center; color: var(--color-text-subtle); }
.media-grid__badge { display: grid; place-items: center; aspect-ratio: 1; width: 100%; border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text-muted); font-weight: var(--weight-bold); }

.media-grid__ai {
  position: absolute;
  top: var(--space-1);
  left: var(--space-1);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-scrim);
  color: var(--color-on-primary);
  font-size: var(--text-xs);
  line-height: 1.5;
  pointer-events: none;
}

.media-grid__meta {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  padding: 2px var(--space-1);
  font-size: var(--text-xs);
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-on-primary);
  background: linear-gradient(transparent, var(--color-scrim));
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-standard);
  pointer-events: none;
}
.media-grid__tile:hover .media-grid__meta,
.media-grid__tile:focus-visible .media-grid__meta { opacity: 1; }
.media-grid__name { font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
