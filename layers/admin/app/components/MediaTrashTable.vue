<script setup lang="ts">
import type { MediaTrashItem } from '#kestrel-admin/types/api'
import { displayFolderPath, humanizeSize } from '../utils/library'

const props = defineProps<{
  items: MediaTrashItem[]
  selected: Set<string>
  allSelected: boolean
  headerIndeterminate: boolean
  busy: boolean
  canRestore: boolean
  canPurge: boolean
  now: number
  inUse: ReadonlySet<string>
}>()
const emit = defineEmits<{ toggleRow: [id: string, on: boolean]; toggleAll: [on: boolean]; restore: [ids: string[]]; purge: [ids: string[]] }>()

const { t, lang } = useT()
const DAY_MS = 86_400_000

const trashedOn = (item: MediaTrashItem) => new Date(item.trashedAt).toLocaleString(lang.value, { dateStyle: 'medium', timeStyle: 'short' })
const expiresIn = (item: MediaTrashItem) => {
  const days = Math.ceil((item.expiresAt - props.now) / DAY_MS)
  return new Intl.RelativeTimeFormat(lang.value, { numeric: 'auto' }).format(days, 'day')
}
const expiresOn = (item: MediaTrashItem) => new Date(item.expiresAt).toLocaleDateString(lang.value, { dateStyle: 'medium' })
const origin = (item: MediaTrashItem) => (item.folder ? displayFolderPath(item.folder) : t('media.trash.rootFolder'))
</script>

<template>
  <KestrelUiTable class="media-trash-table">
    <template #head>
      <th class="ui-table__col--select" scope="col">
        <KestrelUiCheckbox standalone :model-value="allSelected" :indeterminate="headerIndeterminate" :aria-label="t('media.selection.selectAllPage')"
          @update:model-value="(v) => emit('toggleAll', v)" />
      </th>
      <th scope="col">{{ t('media.colName') }}</th>
      <th scope="col">{{ t('media.trash.colOrigin') }}</th>
      <th scope="col">{{ t('media.trash.colTrashed') }}</th>
      <th scope="col">{{ t('media.trash.colExpires') }}</th>
      <th class="ui-table__col--actions" scope="col"><span class="ui-table__vh">{{ t('a11y.rowActions') }}</span></th>
    </template>
    <template #body>
      <tr v-for="item in items" :key="item.id" :class="{ 'is-selected': selected.has(item.id) }">
        <td class="ui-table__col--select">
          <KestrelUiCheckbox standalone :model-value="selected.has(item.id)" :aria-label="t('media.selection.selectItem', { name: item.filename })"
            @update:model-value="(v) => emit('toggleRow', item.id, v)" />
        </td>
        <td>
          <span class="media-trash-table__name">
            <KestrelMediaThumb class="media-trash-table__icon" :path="null" :content-type="item.contentType" />
            <span class="media-trash-table__file">{{ item.filename }}</span>
          </span>
          <span class="media-trash-table__size">{{ humanizeSize(item.size) }}</span>
        </td>
        <td>{{ origin(item) }}</td>
        <td>{{ trashedOn(item) }}</td>
        <td>
          <span v-if="inUse.has(item.id)" class="media-trash-table__kept">{{ t('media.trash.keptInUse') }}</span>
          <span v-else-if="item.expiresAt <= now">{{ t('media.trash.expiresNext') }}</span>
          <time v-else :datetime="new Date(item.expiresAt).toISOString()" :title="expiresOn(item)">{{ expiresIn(item) }}</time>
        </td>
        <td class="ui-table__col--actions">
          <div class="ui-table__actions">
            <KestrelUiButton v-if="canRestore" variant="ghost" size="sm" icon="rotate-ccw" :disabled="busy" :aria-label="t('media.trash.restoreItem', { name: item.filename })" @click="emit('restore', [item.id])" />
            <KestrelUiButton v-if="canPurge" variant="danger-ghost" size="sm" icon="trash" :disabled="busy" :aria-label="t('media.trash.purgeItem', { name: item.filename })" @click="emit('purge', [item.id])" />
          </div>
        </td>
      </tr>
    </template>
  </KestrelUiTable>
</template>

<style lang="scss" scoped>
.media-trash-table { min-width: 40rem; }
.media-trash-table__name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.media-trash-table__icon {
  flex: 0 0 auto;
  width: 1.5rem;
  height: 1.5rem;
}
.media-trash-table__icon :deep(svg) { width: 1.25rem; height: 1.25rem; }
.media-trash-table__file { overflow-wrap: anywhere; }
.media-trash-table__kept { color: var(--color-text-muted); }
.media-trash-table tbody tr:not(.is-selected):hover > :is(.ui-table__col--select, .ui-table__col--actions) { background: linear-gradient(var(--color-hover), var(--color-hover)), var(--color-bg); }
.media-trash-table tbody tr.is-selected > td { background: var(--color-active); }
.media-trash-table tbody tr.is-selected > td:first-child { box-shadow: inset 2px 0 0 var(--color-primary); }
.media-trash-table tbody tr:hover .media-trash-table__size { color: var(--color-text); }
.media-trash-table__size {
  display: block;
  padding-inline-start: calc(1.5rem + var(--space-2));
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
</style>
