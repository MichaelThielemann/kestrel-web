<script setup lang="ts">
import type { RevisionDetail, RevisionSummary } from '#kestrel-admin/types/api'
import { humanizeFieldName } from '../utils/humanize'
import { humanizeSize } from '../utils/library'
import { diffRevision } from '../utils/revision-diff'

const props = defineProps<{
  summary: RevisionSummary | null
  detail: RevisionDetail | null
  loading: boolean
  busy: boolean
  isHead: boolean
  branch: number
  canWrite: boolean
  dirty: boolean
  values: Record<string, unknown>
  fieldKeys: readonly string[]
  blocksField: string
  droppedFields: readonly string[]
  missingFields: readonly string[]
}>()
const emit = defineEmits<{ restore: []; label: [string | null] }>()

const { t, lang } = useT()

const dateFmt = computed(() => new Intl.DateTimeFormat(lang.value, { dateStyle: 'full', timeStyle: 'medium' }))

const labelDraft = ref('')
watch(() => props.summary?.id, () => { labelDraft.value = props.summary?.label ?? '' }, { immediate: true })

const labelDirty = computed(() => labelDraft.value.trim() !== (props.summary?.label ?? ''))

const diff = computed(() => {
  if (!props.detail) return null
  return diffRevision(props.detail.snapshot, props.values, props.fieldKeys, props.blocksField)
})

const changedFields = computed(() => (diff.value?.fields ?? []).map((field) => humanizeFieldName(field)))

function onLabel(): void {
  const next = labelDraft.value.trim()
  emit('label', next === '' ? null : next)
}
</script>

<template>
  <div class="history-details">
    <KestrelUiEmptyState v-if="!summary" :title="t('revisions.selectHint')" />
    <template v-else>
      <h3 class="history-details__title">{{ dateFmt.format(new Date(summary.createdAt)) }}</h3>
      <dl class="history-details__facts">
        <dt>{{ t('revisions.author') }}</dt>
        <dd>{{ summary.author.name ?? t('revisions.unknownAuthor') }}</dd>
        <dt>{{ t('revisions.kind') }}</dt>
        <dd>{{ summary.kind === 'restore' ? t('revisions.kindRestore') : t('revisions.kindSave') }}</dd>
        <dt>{{ t('revisions.branch') }}</dt>
        <dd>{{ t('revisions.branchN', { n: branch }) }}<template v-if="isHead"> · {{ t('revisions.headMarker') }}</template></dd>
        <dt>{{ t('revisions.status') }}</dt>
        <dd>
          {{ summary.status ?? '—' }}
          <span v-if="summary.live" class="history-details__live">{{ t('revisions.liveMarker') }}</span>
        </dd>
        <dt>{{ t('revisions.size') }}</dt>
        <dd>{{ humanizeSize(summary.bytes) }}</dd>
        <dt>{{ t('revisions.locale') }}</dt>
        <dd>{{ summary.locale.toUpperCase() }}</dd>
      </dl>

      <KestrelUiAlert v-if="summary.skipped" variant="warning">{{ t('revisions.skippedNotice') }}</KestrelUiAlert>
      <KestrelUiAlert v-if="droppedFields.length || missingFields.length" variant="warning">
        <template #title>{{ t('revisions.gapTitle') }}</template>
        <p v-if="droppedFields.length" class="history-details__gap">{{ t('revisions.droppedFields', { fields: droppedFields.join(', ') }) }}</p>
        <p v-if="missingFields.length" class="history-details__gap">{{ t('revisions.missingFields', { fields: missingFields.join(', ') }) }}</p>
      </KestrelUiAlert>

      <section class="history-details__section">
        <KestrelSectionLabel :label="t('revisions.diffHeading')" />
        <p v-if="loading" class="history-details__muted">{{ t('revisions.loadingDetail') }}</p>
        <p v-else-if="!diff" class="history-details__muted">{{ t('revisions.noSnapshot') }}</p>
        <p v-else-if="diff.equal" class="history-details__muted">{{ t('revisions.diffEqual') }}</p>
        <template v-else>
          <p v-if="changedFields.length" class="history-details__diff">{{ t('revisions.diffFields', { fields: changedFields.join(', ') }) }}</p>
          <p v-if="diff.blocksBefore !== diff.blocksAfter" class="history-details__diff">
            {{ t('revisions.diffBlockCount', { before: diff.blocksBefore, after: diff.blocksAfter }) }}
          </p>
          <ul v-if="diff.blocks.length" class="history-details__blocks">
            <li v-for="change in diff.blocks" :key="change.type">
              {{ t('revisions.diffBlockType', { type: change.type, before: change.before, after: change.after }) }}
            </li>
          </ul>
        </template>
      </section>

      <section v-if="canWrite" class="history-details__section">
        <KestrelUiField :label="t('revisions.labelField')" :hint="t('revisions.labelHint')">
          <template #default="f">
            <KestrelUiTextInput v-model="labelDraft" :disabled="busy" maxlength="200" v-bind="f" />
          </template>
        </KestrelUiField>
        <KestrelUiButton variant="secondary" size="sm" :disabled="busy || !labelDirty" @click="onLabel">{{ t('revisions.labelSave') }}</KestrelUiButton>
      </section>

      <section class="history-details__section history-details__actions">
        <p class="history-details__muted">{{ t('revisions.restoreExplainer') }}</p>
        <KestrelUiAlert v-if="dirty" variant="warning">{{ t('revisions.restoreDirtyWarning') }}</KestrelUiAlert>
        <KestrelUiButton
          variant="primary"
          icon="history"
          :disabled="busy || summary.skipped || !canWrite || isHead"
          @click="emit('restore')"
        >
          {{ t('revisions.restoreAction') }}
        </KestrelUiButton>
        <p v-if="isHead" class="history-details__muted">{{ t('revisions.alreadyHead') }}</p>
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.history-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.history-details__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
}
.history-details__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  font-size: var(--text-sm);

  dt { color: var(--color-text-muted); }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
}
.history-details__live {
  margin-inline-start: var(--space-1);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-success);
}
.history-details__section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}
.history-details__actions {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
}
.history-details__gap {
  margin: 0;
}
.history-details__muted {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.history-details__diff {
  margin: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
.history-details__blocks {
  margin: 0;
  padding-inline-start: var(--space-4);
  font-size: var(--text-sm);
}
</style>
