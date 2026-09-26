<script setup lang="ts">
import { usePageTree } from '../composables/usePageTree'
import type { PageTreeRow } from '../composables/usePageTree'

const props = defineProps<{ collection: string; locale: string; localeQuery: string; label: string; liveLabel: string; busy: boolean }>()
const emit = defineEmits<{ delete: [ids: string[]] }>()

const { t } = useT()
const deps = useActionDeps()
const { rows, loading, error, expanded, load, setExpanded, parentOf } = usePageTree(deps, props.collection)
const canEdit = computed(() => deps.capabilities.hasVerb(props.collection, 'readAny'))
const canDelete = computed(() => deps.capabilities.hasVerb(props.collection, 'delete'))

const focusedId = ref<string | null>(null)
const items = new Map<string, HTMLElement>()

function setItem(id: string, el: unknown) {
  if (el instanceof HTMLElement) items.set(id, el)
  else items.delete(id)
}

const activeId = computed(() => (focusedId.value !== null && rows.value.some((row) => row.node.id === focusedId.value) ? focusedId.value : rows.value[0]?.node.id ?? null))

function pathOf(row: PageTreeRow): string {
  const value = row.node.paths[props.locale] ?? Object.values(row.node.paths).find((path) => typeof path === 'string')
  return typeof value === 'string' ? value : ''
}

function isLive(row: PageTreeRow): boolean {
  return row.node.live[props.locale] === true
}

function isOpen(row: PageTreeRow): boolean {
  return row.children.length > 0 && expanded.value.has(row.node.id)
}

const editTo = (row: PageTreeRow) => `/admin/${props.collection}/${row.node.id}${props.localeQuery}`
const labelOf = (row: PageTreeRow) => row.node.label || row.node.id

async function focusRow(id: string | null | undefined) {
  if (id === null || id === undefined) return
  focusedId.value = id
  await nextTick()
  items.get(id)?.focus()
}

function toggle(row: PageTreeRow) {
  if (row.children.length > 0) setExpanded(row.node.id, !expanded.value.has(row.node.id))
}

function onKeydown(event: KeyboardEvent, row: PageTreeRow, index: number) {
  if (event.target !== event.currentTarget) return
  const list = rows.value
  switch (event.key) {
    case 'ArrowDown': void focusRow(list[index + 1]?.node.id); break
    case 'ArrowUp': void focusRow(list[index - 1]?.node.id); break
    case 'Home': void focusRow(list[0]?.node.id); break
    case 'End': void focusRow(list.at(-1)?.node.id); break
    case 'ArrowRight':
      if (row.children.length === 0) return
      if (!isOpen(row)) setExpanded(row.node.id, true)
      else void focusRow(row.children[0])
      break
    case 'ArrowLeft':
      if (isOpen(row)) setExpanded(row.node.id, false)
      else void focusRow(parentOf(row.node.id))
      break
    case 'Enter': if (canEdit.value) void navigateTo(editTo(row)); break
    default: return
  }
  event.preventDefault()
}

onMounted(() => { void load() })
onUnmounted(() => { items.clear() })
defineExpose({ load })
</script>

<template>
  <div class="collection-tree">
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <p v-else-if="!loading && rows.length === 0" class="collection-tree__empty">{{ t('tree.empty') }}</p>
    <KestrelUiTable v-else role="treegrid" :sticky="false" class="collection-tree__grid" :aria-label="t('tree.label', { name: label })" :aria-busy="loading ? 'true' : undefined">
      <template #head>
        <th scope="col">{{ t('list.col.title') }}</th>
        <th scope="col" class="collection-tree__path">{{ t('list.col.path') }}</th>
        <th scope="col">{{ t('list.col.status') }}</th>
        <th scope="col"><span class="collection-tree__vh">{{ t('a11y.rowActions') }}</span></th>
      </template>
      <template #body>
        <tr
          v-for="(row, index) in rows"
          :key="row.node.id"
          :ref="(el) => setItem(row.node.id, el)"
          class="collection-tree__row"
          :aria-level="row.depth + 1"
          :aria-setsize="row.siblings"
          :aria-posinset="row.position"
          :aria-expanded="row.children.length > 0 ? isOpen(row) : undefined"
          :tabindex="row.node.id === activeId ? 0 : -1"
          :style="{ '--tree-depth': row.depth }"
          @keydown="onKeydown($event, row, index)"
          @focusin="focusedId = row.node.id"
        >
          <td class="collection-tree__main">
            <span class="collection-tree__toggle" aria-hidden="true" @click="toggle(row)">
              <KestrelUiIcon v-if="row.children.length > 0" :name="isOpen(row) ? 'chevron-down' : 'chevron-right'" />
            </span>
            <NuxtLink v-if="canEdit" class="collection-tree__label" :to="editTo(row)" tabindex="-1">{{ labelOf(row) }}</NuxtLink>
            <span v-else class="collection-tree__label">{{ labelOf(row) }}</span>
          </td>
          <td class="collection-tree__path">{{ pathOf(row) || t('tree.noPath') }}</td>
          <td class="collection-tree__status">
            <span class="collection-tree__badge" :class="{ 'collection-tree__badge--live': isLive(row) }">{{ isLive(row) ? liveLabel : t('tree.notLive') }}</span>
          </td>
          <td class="collection-tree__actions">
            <KestrelUiButton v-if="canEdit" :to="editTo(row)" variant="ghost" size="sm" icon="pencil" :tabindex="row.node.id === activeId ? 0 : -1" :aria-label="t('list.rowEdit', { name: labelOf(row) })" />
            <KestrelUiButton v-if="canDelete" variant="danger-ghost" size="sm" icon="trash" :disabled="busy" :tabindex="row.node.id === activeId ? 0 : -1" :aria-label="t('list.rowDelete', { name: labelOf(row) })" @click="emit('delete', [row.node.id])" />
          </td>
        </tr>
      </template>
    </KestrelUiTable>
  </div>
</template>

<style lang="scss">
.collection-tree {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;

  &__empty {
    color: var(--color-text-muted);
  }
  &__row:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }
  &__vh {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  &__main {
    padding-inline-start: calc(var(--space-3) + var(--tree-depth, 0) * 1.5rem) !important;
    white-space: nowrap;
  }
  &__toggle {
    display: inline-flex;
    width: 1.25rem;
    justify-content: center;
    cursor: pointer;
    color: var(--color-text-muted);
    vertical-align: middle;
  }
  &__label {
    color: var(--color-text);
    font-weight: var(--weight-medium);
    font-size: var(--text-base);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
  &__path {
    width: 100%;
    color: var(--color-text-muted);
    text-align: end;
    overflow-wrap: anywhere;
  }
  &__badge {
    display: inline-block;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    white-space: nowrap;

    &--live {
      border-color: var(--color-success);
      color: var(--color-text);
    }
  }
  &__actions {
    white-space: nowrap;
  }
}
</style>
