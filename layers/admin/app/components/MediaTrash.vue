<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { focusLost } from '../composables/useMediaKeyboard'
import { countMessage } from '../utils/media-removal'

const { t } = useT()
const route = useRoute()
const root = ref<HTMLElement | null>(null)
const heading = ref<HTMLElement | null>(null)
let actedAt = 0
let focusTimer: ReturnType<typeof setTimeout> | null = null
const trash = useMediaTrash({ onSettled: () => { void nextTick(() => { focusTimer = setTimeout(returnFocus, 0) }) } })
const { items, total, page, perPage, totalPages, loading, busy, error, dialog, selection } = trash

const now = ref(Date.now())
const clock = setInterval(() => { now.value = Date.now() }, 60_000)
onUnmounted(() => {
  clearInterval(clock)
  if (focusTimer) clearTimeout(focusTimer)
})

const back = computed(() => (typeof route.query.folder === 'string' && route.query.folder ? `/admin/media?folder=${encodeURIComponent(route.query.folder)}` : '/admin/media'))
const selectedIds = computed(() => items.value.map((item) => item.id).filter((id) => selection.selected.has(id)))
const label = computed(() => countMessage(t, 'media.selection.count', selectedIds.value.length))
const status = useSelectionAnnouncement(() => selectedIds.value.length, (n) => countMessage(t, 'media.selection.count', n), () => t('media.selection.cleared'))
const clearShortcut = computed(() => ({ keys: 'Escape', label: t('media.selection.keyEscape') }))

function remember(ids: string[]) { actedAt = Math.max(0, items.value.findIndex((item) => ids.includes(item.id))) }
function onRestore(ids: string[]) { remember(ids); void trash.restore(ids) }
function onPurge(ids: string[]) { remember(ids); trash.askPurge(ids) }
function onClear() {
  selection.clear()
  actedAt = 0
  void nextTick(returnFocus)
}

function returnFocus() {
  if (!focusLost()) return
  const boxes = root.value?.querySelectorAll<HTMLElement>('tbody input[type="checkbox"]') ?? []
  const next = boxes[Math.min(actedAt, boxes.length - 1)]
  if (next) next.focus()
  else heading.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selection.selected.size && !dialog.value) onClear()
}
</script>

<template>
  <section ref="root" class="media-trash" :aria-busy="loading || undefined" @keydown="onKeydown">
    <div class="media-trash__head">
      <KestrelUiButton variant="ghost" size="sm" icon="arrow-left" :to="back" data-test="media-trash-back">{{ t('media.trash.back') }}</KestrelUiButton>
      <h2 ref="heading" class="media-trash__title" tabindex="-1">{{ t('media.trash.title') }}</h2>
    </div>
    <p class="media-trash__lede">{{ t('media.trash.lede') }}</p>
    <div class="media-trash__bar">
      <KestrelUiBulkBar v-if="selectedIds.length" :label="label" :clear-label="t('media.selection.clear')" :clear-shortcut="clearShortcut" :busy="busy" @clear="onClear">
        <KestrelUiButton v-if="trash.canRestore.value" size="sm" variant="ghost" icon="rotate-ccw" :disabled="busy" @click="onRestore(selectedIds)">{{ t('media.trash.restore') }}</KestrelUiButton>
        <KestrelUiButton v-if="trash.canPurge.value" size="sm" variant="danger-ghost" icon="trash" :disabled="busy" @click="onPurge(selectedIds)">{{ t('media.trash.purge') }}</KestrelUiButton>
      </KestrelUiBulkBar>
      <KestrelUiButton v-else-if="trash.canEmpty.value && total > 0" size="sm" variant="danger-ghost" icon="trash" :disabled="busy" @click="trash.askEmpty()">{{ t('media.trash.emptyAll') }}</KestrelUiButton>
    </div>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <KestrelUiEmptyState v-else-if="!loading && !items.length" icon="trash" :title="t('media.trash.empty')" />
    <div v-else class="media-trash__table">
      <KestrelMediaTrashTable
        :items="items" :selected="selection.selected" :all-selected="selection.allSelected.value" :header-indeterminate="selection.headerIndeterminate.value"
        :busy="busy" :can-restore="trash.canRestore.value" :can-purge="trash.canPurge.value" :now="now"
        @toggle-row="selection.toggleRow" @toggle-all="selection.toggleAll" @restore="onRestore" @purge="onPurge"
      />
    </div>
    <KestrelCollectionListPager v-if="totalPages > 1" :page="page" :total-pages="totalPages" :total="total" :per-page="perPage" @update:page="trash.setPage" @update:per-page="trash.setPerPage" />
    <KestrelUiLiveStatus :message="status" />
    <KestrelMediaDeleteDialog :state="dialog" :busy="busy" @confirm="trash.confirm" @cancel="trash.cancel" />
  </section>
</template>

<style lang="scss" scoped>
.media-trash {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.media-trash__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.media-trash__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
}
.media-trash__lede {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.media-trash__bar {
  display: flex;
  align-items: center;
  min-height: 2.5rem;
}
.media-trash__table { overflow-x: auto; }
</style>
