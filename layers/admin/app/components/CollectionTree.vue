<script setup lang="ts">
import { usePageTree } from '../composables/usePageTree'
import type { PageTreeRow } from '../composables/usePageTree'

const props = defineProps<{ collection: string; locale: string; localeQuery: string; label: string }>()

const { t } = useT()
const deps = useActionDeps()
const { rows, loading, error, expanded, load, setExpanded, parentOf } = usePageTree(deps, props.collection)

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

function isOpen(row: PageTreeRow): boolean {
  return row.children.length > 0 && expanded.value.has(row.node.id)
}

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
    case 'Enter': void navigateTo(`/admin/${props.collection}/${row.node.id}${props.localeQuery}`); break
    default: return
  }
  event.preventDefault()
}

onMounted(() => { void load() })
onUnmounted(() => { items.clear() })
</script>

<template>
  <div class="collection-tree">
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <p v-else-if="!loading && rows.length === 0" class="collection-tree__empty">{{ t('tree.empty') }}</p>
    <ul v-else role="tree" class="collection-tree__list" :aria-label="t('tree.label', { name: label })" :aria-busy="loading ? 'true' : undefined">
      <li
        v-for="(row, index) in rows"
        :key="row.node.id"
        :ref="(el) => setItem(row.node.id, el)"
        role="treeitem"
        class="collection-tree__item"
        :aria-level="row.depth + 1"
        :aria-expanded="row.children.length > 0 ? isOpen(row) : undefined"
        :aria-selected="row.node.id === activeId ? 'true' : 'false'"
        :tabindex="row.node.id === activeId ? 0 : -1"
        :style="{ '--tree-depth': row.depth }"
        @keydown="onKeydown($event, row, index)"
        @focus="focusedId = row.node.id"
      >
        <span class="collection-tree__toggle" aria-hidden="true" @click="toggle(row)">
          <KestrelUiIcon v-if="row.children.length > 0" :name="isOpen(row) ? 'chevron-down' : 'chevron-right'" />
        </span>
        <NuxtLink class="collection-tree__label" :to="`/admin/${collection}/${row.node.id}${localeQuery}`" tabindex="-1">{{ row.node.label || row.node.id }}</NuxtLink>
        <span class="collection-tree__path">{{ pathOf(row) || t('tree.noPath') }}</span>
      </li>
    </ul>
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
  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }
  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.75rem;
    padding: var(--space-2) var(--space-3);
    padding-inline-start: calc(var(--space-3) + var(--tree-depth, 0) * 1.5rem);
    border-bottom: 1px solid var(--color-border);

    &:last-child {
      border-bottom: 0;
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
  }
  &__toggle {
    display: inline-flex;
    width: 1.25rem;
    justify-content: center;
    cursor: pointer;
    color: var(--color-text-muted);
  }
  &__label {
    color: var(--color-text);
    font-weight: var(--weight-medium);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
  &__path {
    margin-inline-start: auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
}
</style>
