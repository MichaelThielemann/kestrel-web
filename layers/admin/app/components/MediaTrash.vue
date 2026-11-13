<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

const { t } = useT()
const trash = useMediaTrash()
const { items, total, page, perPage, totalPages, loading, busy, error, dialog, selection } = trash

const now = ref(Date.now())
const clock = setInterval(() => { now.value = Date.now() }, 60_000)
onUnmounted(() => clearInterval(clock))

const selectedIds = computed(() => items.value.map((item) => item.id).filter((id) => selection.selected.has(id)))
const label = computed(() => (selectedIds.value.length === 1 ? t('media.selection.count') : t('media.selection.countPlural', { n: selectedIds.value.length })))
const clearShortcut = computed(() => ({ keys: 'Escape', label: t('media.selection.keyEscape') }))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selection.selected.size && !dialog.value) selection.clear()
}
</script>

<template>
  <section class="media-trash" :aria-busy="loading || undefined" @keydown="onKeydown">
    <div class="media-trash__head">
      <KestrelUiButton variant="ghost" size="sm" icon="arrow-left" to="/admin/media">{{ t('media.trash.back') }}</KestrelUiButton>
      <h2 class="media-trash__title">{{ t('media.trash.title') }}</h2>
    </div>
    <p class="media-trash__lede">{{ t('media.trash.lede') }}</p>
    <div class="media-trash__bar">
      <KestrelUiBulkBar v-if="selectedIds.length" :label="label" :clear-label="t('media.selection.clear')" :clear-shortcut="clearShortcut" :busy="busy" @clear="selection.clear()">
        <KestrelUiButton v-if="trash.canRestore.value" size="sm" variant="ghost" icon="rotate-ccw" :disabled="busy" @click="trash.restore(selectedIds)">{{ t('media.trash.restore') }}</KestrelUiButton>
        <KestrelUiButton v-if="trash.canPurge.value" size="sm" variant="danger-ghost" icon="trash" :disabled="busy" @click="trash.askPurge(selectedIds)">{{ t('media.trash.purge') }}</KestrelUiButton>
      </KestrelUiBulkBar>
      <KestrelUiButton v-else-if="trash.canEmpty.value && total > 0" size="sm" variant="danger-ghost" icon="trash" :disabled="busy" @click="trash.askEmpty()">{{ t('media.trash.emptyAll') }}</KestrelUiButton>
    </div>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <KestrelUiEmptyState v-else-if="!loading && !items.length" icon="trash" :title="t('media.trash.empty')" />
    <div v-else class="media-trash__table">
      <KestrelMediaTrashTable
        :items="items" :selected="selection.selected" :all-selected="selection.allSelected.value" :header-indeterminate="selection.headerIndeterminate.value"
        :busy="busy" :can-restore="trash.canRestore.value" :can-purge="trash.canPurge.value" :now="now"
        @toggle-row="selection.toggleRow" @toggle-all="selection.toggleAll" @restore="trash.restore" @purge="trash.askPurge"
      />
    </div>
    <KestrelCollectionListPager v-if="totalPages > 1" :page="page" :total-pages="totalPages" :total="total" :per-page="perPage" @update:page="trash.setPage" @update:per-page="trash.setPerPage" />
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
