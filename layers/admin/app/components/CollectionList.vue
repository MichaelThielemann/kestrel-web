<script setup lang="ts">
import type { SerializedCollection } from '#kestrel-admin/types/kestrel'
import { resolveLocalized } from '#kestrel-admin/utils/localized'
import { listColumns } from '../utils/list-columns'
import { statusChoices as choicesOf } from '../utils/workflow-status'

const props = defineProps<{ schema: SerializedCollection; locale?: string }>()

const { t, lang } = useT()
const { locales, primary } = useContentLocales()
const capabilities = useCapabilities()

const collection = computed(() => props.schema.name)
const canCreate = computed(() => capabilities.hasVerb(collection.value, 'create'))
const canBulkUpdate = computed(() => capabilities.hasVerb(collection.value, 'update'))
const canBulkDelete = computed(() => capabilities.hasVerb(collection.value, 'delete'))
const label = computed(() => resolveLocalized(props.schema.label?.singular, lang.value) ?? props.schema.name)

const newLabel = computed(() => resolveLocalized(props.schema.label?.new, lang.value) ?? t('common.new', { label: label.value }))
const localeQuery = computed(() => (props.locale ? `?locale=${props.locale}` : ''))

const columns = listColumns(props.schema)
const hasTree = computed(() => capabilities.hasVerb(collection.value, 'tree'))
const view = ref<string | null>(hasTree.value ? 'tree' : 'list')
const viewOptions = computed(() => [
  { value: 'tree', label: t('tree.viewTree') },
  { value: 'list', label: t('tree.viewList') },
])
const pluralLabel = computed(() => resolveLocalized(props.schema.label?.plural, lang.value) ?? props.schema.name)
const workflow = computed(() => props.schema.workflow)
const statusChoices = computed(() => choicesOf(props.schema))

const { sort, page, perPage, setSort, setPage, clampPage, setPerPage } = useListUrlState(props.schema)

const { rows, total, fallbackTitles, error, totalPages, fetchRows } = useListRows({
  collection,
  sort,
  page,
  perPage,
  locale: () => props.locale,
  clampPage: (p: number) => { void clampPage(p) },

  onLoaded: () => clearSelection(),
})

const search = ref('')
const showTree = computed(() => hasTree.value && view.value === 'tree' && search.value.trim() === '' && selected.size === 0)
const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) => {
    const title = String(r.title ?? fallbackTitles.value[String(r.id)] ?? '')
    return title.toLowerCase().includes(q) || String(r.slug ?? '').toLowerCase().includes(q)
  })
})

const { selected, allSelected, headerIndeterminate, toggleRow, toggleAll, clear: clearSelection } =
  useListSelection(filteredRows)

const treeRef = ref<{ load: () => Promise<void> } | null>(null)
async function refresh() {
  await fetchRows()
  await treeRef.value?.load()
}
const liveLabel = computed(() => {
  const live = workflow.value?.live
  const choice = statusChoices.value.find((c) => c.value === live)
  return choice ? (resolveLocalized(choice.label, lang.value) ?? String(live)) : t('tree.live')
})

const { busy: opsBusy, error: opsError, deleteOpen, deleteReport, askDelete, confirmDelete, setStatus } =
  useListBatchActions(collection, refresh, workflow)

const resultsLabel = computed(() => t(total.value === 1 ? 'list.result' : 'list.results', { total: total.value }))
const srStatus = computed(() => (selected.size ? t('list.selected', { n: selected.size }) : resultsLabel.value))

watch([sort, page, perPage], fetchRows)

await fetchRows()
</script>

<template>
  <div class="list">
    <div class="list__bar">
      <div v-if="locale" class="list__locales" role="group" :aria-label="t('a11y.contentLocale')">
        <NuxtLink
          v-for="loc in locales"
          :key="loc"
          :to="`/admin/${collection}?locale=${loc}`"
          class="list__locale"
          :class="{ 'list__locale--active': loc === locale }"
          :aria-current="loc === locale ? 'true' : undefined"
        >{{ loc.toUpperCase() }}</NuxtLink>
      </div>

      <KestrelUiButtonGroup v-if="hasTree" v-model="view" :options="viewOptions" :aria-label="t('tree.viewLabel')" />

      <label class="list__search">
        <span class="list__vh">{{ t('list.search') }}</span>
        <KestrelUiTextInput v-model="search" type="search" icon="search" :placeholder="t('list.searchPlaceholder')" />
      </label>

      <KestrelCollectionListBulkBar
        v-if="selected.size"
        :count="selected.size"
        :has-workflow="!!workflow"
        :can-update="canBulkUpdate"
        :can-delete="canBulkDelete"
        :busy="opsBusy"
        @set-status="(live) => setStatus([...selected], live, locale)"
        @delete="askDelete([...selected])"
        @clear="clearSelection"
      />

      <NuxtLink v-if="canCreate" :to="`/admin/${collection}/new${localeQuery}`" class="list__new">{{ newLabel }}</NuxtLink>
    </div>

    <KestrelUiAlert v-if="error" variant="error" class="list__error">
      {{ error }}
      <KestrelUiButton type="button" variant="secondary" size="sm" class="list__retry" @click="fetchRows">{{ t('common.retry') }}</KestrelUiButton>
    </KestrelUiAlert>

    <KestrelCollectionTree
      v-if="showTree"
      ref="treeRef"
      :collection="collection"
      :locale="locale ?? primary"
      :locale-query="localeQuery"
      :label="pluralLabel"
      :live-label="liveLabel"
      :busy="opsBusy"
      @delete="askDelete"
    />

    <div v-else class="u-scroll">
      <KestrelCollectionListTable
        :rows="filteredRows"
        :columns="columns"
        :collection="collection"
        :locale-query="localeQuery"
        :locale="locale"
        :primary-locale="primary"
        :fallback-titles="fallbackTitles"
        :sort="sort"
        :busy="opsBusy"
        :selected="selected"
        :all-selected="allSelected"
        :header-indeterminate="headerIndeterminate"
        :status-choices="statusChoices"
        :workflow="workflow"
        @sort="setSort"
        @toggle-row="toggleRow"
        @toggle-all="toggleAll"
        @delete="askDelete"
      />

      <KestrelUiEmptyState
        v-if="!filteredRows.length && !error && search"
        icon="search"
        :title="t('list.noSearchMatch.title')"
        :description="t('list.noSearchMatch.desc', { query: search })"
      />
      <KestrelUiEmptyState
        v-else-if="!rows.length && !error"
        icon="file-text"
        :title="t('list.empty.title')"
        :description="t('list.empty.desc', { name: label })"
      >
        <template #action>
          <NuxtLink v-if="canCreate" :to="`/admin/${collection}/new${localeQuery}`" class="list__new">{{ newLabel }}</NuxtLink>
        </template>
      </KestrelUiEmptyState>
    </div>

    <p class="list__sr-status" role="status" aria-live="polite">{{ srStatus }}</p>

    <KestrelCollectionListPager
      v-if="!showTree"
      :page="page"
      :total-pages="totalPages"
      :total="total"
      :per-page="perPage"
      @update:page="setPage"
      @update:per-page="setPerPage"
    />

    <KestrelCollectionDeleteDialog
      :open="deleteOpen"
      :report="deleteReport"
      :busy="opsBusy"
      :error="opsError"
      @update:open="deleteOpen = $event"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style lang="scss">
.list__retry {
  margin-inline-start: var(--space-3);
}

.list__sr-status,
.list__vh {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;

  &__bar,
  &__bulkbar,
  &__error,
  &__pager {
    flex: 0 0 auto;
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  &__locales {
    display: flex;
    gap: var(--space-1);
  }
  &__locale {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    text-decoration: none;

    &--active {
      background: var(--color-surface);
      color: var(--color-text);
    }
  }

  &__search {
    display: inline-flex;
    align-items: center;
    width: 16rem;
    max-width: 40vw;
  }

  &__new {
    margin-left: auto;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-on-primary);
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);

    &:hover {
      background: var(--color-primary-hover);
    }
  }
}
</style>
