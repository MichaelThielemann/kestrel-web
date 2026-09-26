<script setup lang="ts">
import type { DeliveryEntry } from '#kestrel-admin/types/api'
import type { Workflow } from '#kestrel-admin/types/kestrel'
import type { MenuItem } from './ui/Menu.vue'

const props = defineProps<{
  showHistory: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  canSave: boolean
  canWrite: boolean
  canDelete: boolean
  deleting: boolean
  formId: string
  workflow?: Workflow
  canPublish: boolean
  published: boolean
  publishBlocked: boolean
  dirty: boolean
  status?: string
  deliveryEnabled: boolean
  delivery: DeliveryEntry[] | null
  deliveryLoading: boolean
  locale?: string
  publicUrl: string
}>()

const emit = defineEmits<{
  history: []
  undo: []
  redo: []
  cancel: []
  delete: []
  publish: []
  unpublish: []
}>()

const { t } = useT()
const isPhone = useIsPhone()

const NO_CHANGES_ID = 'record-editor-no-changes'

const overflowItems = computed<MenuItem[]>(() => [
  ...(props.showHistory ? [{ label: t('revisions.open'), value: 'history', disabled: props.saving }] : []),
  { label: t('history.undo'), value: 'undo', disabled: props.saving || !props.canUndo },
  { label: t('history.redo'), value: 'redo', disabled: props.saving || !props.canRedo },
  ...(props.workflow && props.canPublish
    ? [
        props.published
          ? { label: t('common.unpublish'), value: 'unpublish', disabled: props.saving }
          : { label: t('common.publish'), value: 'publish', disabled: props.saving || props.publishBlocked },
      ]
    : []),
])

const overflowHandlers: Record<string, () => void> = {
  history: () => emit('history'),
  undo: () => emit('undo'),
  redo: () => emit('redo'),
  publish: () => emit('publish'),
  unpublish: () => emit('unpublish'),
}

function onOverflowSelect(value: string) {
  overflowHandlers[value]?.()
}
</script>

<template>
  <div class="record-actions">
    <template v-if="!isPhone">
      <KestrelUiButton v-if="showHistory" type="button" variant="ghost" size="sm" icon="history" :disabled="saving" :title="t('revisions.open')" :aria-label="t('revisions.open')" @click="emit('history')" />
      <KestrelUiButton type="button" variant="ghost" size="sm" icon="undo" :disabled="saving || !canUndo" :title="t('history.undo')" :aria-label="t('history.undo')" @click="emit('undo')" />
      <KestrelUiButton type="button" variant="ghost" size="sm" icon="redo" :disabled="saving || !canRedo" :title="t('history.redo')" :aria-label="t('history.redo')" @click="emit('redo')" />
    </template>
    <KestrelUiActionMenu
      v-else-if="overflowItems.length"
      :items="overflowItems"
      :label="t('editor.moreActions')"
      trigger-class="ui-button--icon ui-button--icon-sm"
      @select="onOverflowSelect"
    ><KestrelUiIcon name="more-horizontal" :size="15" /></KestrelUiActionMenu>

    <KestrelUiButton type="button" variant="secondary" size="sm" icon="x" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
    <KestrelUiButton v-if="canDelete" variant="danger" size="sm" icon="trash" :loading="deleting" @click="emit('delete')">{{ t('common.delete') }}</KestrelUiButton>
    <template v-if="canWrite">
      <KestrelUiButton
        type="submit"
        :form="formId"
        variant="primary"
        size="sm"
        icon="check"
        :loading="saving"
        :disabled="!canSave"
        :title="canSave ? undefined : t('editor.noChangesToSave')"
        :aria-describedby="canSave ? undefined : NO_CHANGES_ID"
      >{{ t('common.save') }}</KestrelUiButton>
      <span :id="NO_CHANGES_ID" class="record-actions__hint">{{ t('editor.noChangesToSave') }}</span>
    </template>

    <template v-if="!isPhone">
      <KestrelUiButton v-if="workflow && canPublish && !published" type="button" variant="secondary" size="sm" icon="upload" :disabled="saving || publishBlocked" :title="publishBlocked ? t('editor.publishNeedsTranslation') : undefined" @click="emit('publish')">{{ t('common.publish') }}</KestrelUiButton>
      <KestrelUiButton v-else-if="workflow && canPublish" type="button" variant="secondary" size="sm" icon="undo" :disabled="saving" @click="emit('unpublish')">{{ t('common.unpublish') }}</KestrelUiButton>
    </template>

    <KestrelEditorStatus
      class="record-actions__ampel"
      :dirty="dirty"
      :saving="saving"
      :workflow="workflow"
      :status="status"
      :delivery-enabled="deliveryEnabled"
      :delivery="delivery"
      :delivery-loading="deliveryLoading"
      :locale="locale"
      :public-url="publicUrl"
    />
  </div>
</template>

<style lang="scss">
@use '../assets/scss/mixins';

.record-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-left: auto;

  &__hint {
    @include mixins.sr-only;
  }

  &__ampel {
    margin-inline-start: var(--space-1);
    padding-inline-start: var(--space-3);
    border-inline-start: 1px solid var(--color-border);
  }
}
</style>
