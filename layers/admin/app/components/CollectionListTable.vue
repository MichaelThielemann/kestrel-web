<script setup lang="ts">
import { sortDirection } from '../utils/list-query'
import { cellDisplay, columnLabel } from '../utils/list-cell'
import type { ListColumn } from '../utils/list-columns'
import { resolveLocalized } from '#kestrel/utils/localized'
import type { Localized } from '#kestrel/types/kestrel'

const props = defineProps<{
  rows: Record<string, unknown>[]
  columns: ListColumn[]
  collection: string
  localeQuery: string

  locale?: string
  primaryLocale: string

  fallbackTitles?: Record<string, string>
  sort: string
  busy: boolean
  selected: Set<string>
  allSelected: boolean
  headerIndeterminate: boolean
  statusChoices: { value: string; label: Localized }[]
}>()
const emit = defineEmits<{
  sort: [key: string]
  toggleRow: [id: string, on: boolean]
  toggleAll: [on: boolean]
  delete: [ids: string[]]
}>()

const { t, lang } = useT()

const colLabel = (col: ListColumn) => columnLabel(col, t)

function untranslated(row: Record<string, unknown>): boolean {
  if (!props.locale) return false
  const flags = row._translations as Record<string, boolean> | undefined
  return flags ? flags[props.locale] === false : row.title == null
}

function rowTitle(row: Record<string, unknown>): string {
  return (row.title as string) || props.fallbackTitles?.[String(row.id)] || t('list.untitled')
}
const rowLabel = (row: Record<string, unknown>) => rowTitle(row)

const fallbackLocale = (row: Record<string, unknown>) =>
  !row.title && props.fallbackTitles?.[String(row.id)] ? props.primaryLocale.toUpperCase() : ''

function statusLabel(value: unknown): string {
  const v = value ?? 'draft'
  const choice = props.statusChoices.find((c) => c.value === v)
  return choice ? (resolveLocalized(choice.label, lang.value) ?? String(v)) : String(v)
}
function cellText(c: ListColumn, row: Record<string, unknown>): string {
  return c.key === 'status' ? statusLabel(row.status) : cellDisplay(c, row)
}

function ariaSort(field: string): 'ascending' | 'descending' | 'none' {
  const dir = sortDirection(props.sort, field)
  return dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
}
</script>

<template>
  <KestrelUiTable>
    <template #head>
      <th class="ui-table__col--select" scope="col">
        <KestrelUiCheckbox
          :model-value="allSelected"
          :indeterminate="headerIndeterminate"
          :aria-label="t('list.selectAll')"
          @update:model-value="(v) => emit('toggleAll', v)"
        />
      </th>

      <th class="ui-table__col--actions" scope="col">
        <span class="ui-table__vh">{{ t('a11y.rowActions') }}</span>
      </th>
      <th v-for="c in columns" :key="c.key" scope="col" :aria-sort="c.sortable ? ariaSort(c.key) : undefined">
        <KestrelUiTableSort v-if="c.sortable" :field="c.key" :sort="sort" @sort="emit('sort', $event)">{{ colLabel(c) }}</KestrelUiTableSort>
        <span v-else>{{ colLabel(c) }}</span>
      </th>
    </template>
    <template #body>
      <tr v-for="row in rows" :key="String(row.id)" :class="{ 'ui-table__row--muted': untranslated(row) }">
        <td class="ui-table__col--select">
          <KestrelUiCheckbox
            :model-value="selected.has(String(row.id))"
            :aria-label="t('list.selectRow', { name: rowLabel(row) })"
            @update:model-value="(v) => emit('toggleRow', String(row.id), v)"
          />
        </td>
        <td class="ui-table__col--actions">
          <div class="ui-table__actions">
            <KestrelUiButton :to="`/admin/${collection}/${row.id}${localeQuery}`" variant="ghost" size="sm" icon="pencil" :aria-label="t('list.rowEdit', { name: rowLabel(row) })" />
            <KestrelUiButton variant="danger-ghost" size="sm" icon="trash" :disabled="busy" :aria-label="t('list.rowDelete', { name: rowLabel(row) })" @click="emit('delete', [String(row.id)])" />
          </div>
        </td>
        <td v-for="c in columns" :key="c.key">
          <template v-if="c.key === 'title'">
            <span :title="untranslated(row) ? t('list.missingTranslation') : undefined">{{ rowTitle(row) }}</span>
            <span v-if="fallbackLocale(row)" class="list__badge" :title="t('list.missingTranslation')">{{ fallbackLocale(row) }}</span>
          </template>
          <template v-else>{{ cellText(c, row) }}</template>
        </td>
      </tr>
    </template>
  </KestrelUiTable>
</template>

<style lang="scss">
.list__badge {
  display: inline-block;
  margin-inline-start: var(--space-2);
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs, 0.75rem);
  font-style: normal;
  letter-spacing: 0.03em;
}
</style>
