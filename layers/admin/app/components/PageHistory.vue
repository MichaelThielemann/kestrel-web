<script setup lang="ts">
import { usePageHistory } from '../composables/usePageHistory'

const props = defineProps<{
  open: boolean
  collection: string
  id: string
  locale: string
  canWrite: boolean
  dirty: boolean
  values: Record<string, unknown>
  fieldKeys: readonly string[]
  blocksField: string
}>()
const emit = defineEmits<{ 'update:open': [boolean]; restored: [] }>()

const { t } = useT()

const locale = computed(() => props.locale)
const history = usePageHistory({
  collection: props.collection,
  id: props.id,
  locale,
  onRestored: () => emit('restored'),
})

const confirmOpen = ref(false)

const selectedRow = computed(() => history.layout.value.rows.find((row) => row.revision.id === history.selectedId.value) ?? null)

watch(
  () => [props.open, props.locale] as const,
  ([open]) => {
    if (open) void history.reload()
  },
  { immediate: true },
)

async function onRestore(): Promise<void> {
  const revisionId = history.selectedId.value
  if (!revisionId) return
  const ok = await history.restore(revisionId)
  if (ok) confirmOpen.value = false
}

async function onLabel(label: string | null): Promise<void> {
  const revisionId = history.selectedId.value
  if (!revisionId) return
  await history.saveLabel(revisionId, label)
}
</script>

<template>
  <KestrelUiDialog
    :open="open"
    size="screen"
    :title="t('revisions.title')"
    :description="t('revisions.intro')"
    @update:open="emit('update:open', $event)"
  >
    <div class="page-history">
      <div class="page-history__tree">
        <p v-if="history.loading.value" class="page-history__muted">{{ t('revisions.loading') }}</p>
        <KestrelUiAlert v-else-if="history.error.value" variant="error">{{ history.error.value }}</KestrelUiAlert>
        <KestrelUiEmptyState v-else-if="history.items.value.length === 0" icon="history" :title="t('revisions.empty')" :description="t('revisions.emptyHint')" />
        <KestrelPageHistoryTree
          v-else
          :layout="history.layout.value"
          :selected-id="history.selectedId.value"
          :has-more="history.hasMore.value"
          :loading-more="history.loadingMore.value"
          :busy="history.busy.value"
          @select="history.select"
          @load-more="history.loadMore"
        />
      </div>
      <div class="page-history__details">
        <KestrelPageHistoryDetails
          :summary="history.selected.value"
          :detail="history.detail.value"
          :loading="history.detailLoading.value"
          :busy="history.busy.value"
          :is-head="selectedRow?.head ?? false"
          :branch="selectedRow?.branch ?? 1"
          :can-write="canWrite"
          :dirty="dirty"
          :values="values"
          :field-keys="fieldKeys"
          :blocks-field="blocksField"
          @restore="confirmOpen = true"
          @label="onLabel"
        />
      </div>
    </div>

    <KestrelUiDialog
      :open="confirmOpen"
      nested
      :title="t('revisions.confirmTitle')"
      @update:open="confirmOpen = $event"
    >
      <p>{{ t('revisions.confirmBody') }}</p>
      <KestrelUiAlert v-if="dirty" variant="warning">{{ t('revisions.restoreDirtyWarning') }}</KestrelUiAlert>
      <KestrelUiAlert v-if="history.error.value" variant="error">{{ history.error.value }}</KestrelUiAlert>
      <template #footer>
        <KestrelUiButton variant="ghost" :disabled="history.busy.value" @click="confirmOpen = false">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton variant="primary" :loading="history.busy.value" @click="onRestore">{{ t('revisions.restoreAction') }}</KestrelUiButton>
      </template>
    </KestrelUiDialog>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.page-history {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--space-5);
  flex: 1 1 auto;
  min-height: 0;
}
.page-history__tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  border-inline-end: 1px solid var(--color-border);
  padding-inline-end: var(--space-4);
}
.page-history__details {
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.page-history__muted {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
@media (max-width: 48rem) {
  .page-history {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    flex: 0 0 auto;
    min-height: auto;
  }
  .page-history__details { overflow-y: visible; }
  .page-history__tree {
    border-inline-end: 0;
    padding-inline-end: 0;
    border-block-end: 1px solid var(--color-border);
    padding-block-end: var(--space-3);
  }
}
</style>
