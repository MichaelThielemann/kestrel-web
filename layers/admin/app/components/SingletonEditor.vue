<script setup lang="ts">

import type { EditorExpose } from '../utils/editor-expose'

defineProps<{ collection: string; title: string; localeParam?: string }>()

const { t } = useT()

const EDITOR_FORM_ID = 'singleton-editor'
const editorRef = ref<EditorExpose | null>(null)
const saving = computed(() => editorRef.value?.saving ?? false)

useUnsavedGuard(() => editorRef.value?.dirty ?? false, () => t('editor.discardConfirm'))
</script>

<template>
  <section class="singleton">
    <div class="singleton__head">
      <h1 class="singleton__title">{{ title }}</h1>
      <div class="singleton__actions">
        <KestrelUiButton type="button" variant="ghost" size="sm" icon="undo" :disabled="saving || !editorRef?.canUndo" :title="t('history.undo')" :aria-label="t('history.undo')" @click="editorRef?.undo()" />
        <KestrelUiButton type="button" variant="ghost" size="sm" icon="redo" :disabled="saving || !editorRef?.canRedo" :title="t('history.redo')" :aria-label="t('history.redo')" @click="editorRef?.redo()" />
        <KestrelUiButton type="submit" :form="EDITOR_FORM_ID" variant="primary" size="sm" icon="check" :loading="saving">{{ t('common.save') }}</KestrelUiButton>
        <KestrelEditorStatus class="singleton__ampel" :dirty="editorRef?.dirty ?? false" :saving="saving" :has-status="editorRef?.hasStatus ?? false" :status="editorRef?.savedStatus" />
      </div>
    </div>
    <KestrelCollectionEditor
      id="single"
      ref="editorRef"
      :collection="collection"
      :form-id="EDITOR_FORM_ID"
      :locale-param="localeParam"
      :actions="false"
    />
  </section>
</template>

<style lang="scss">

.singleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  &__head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }
  &__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    text-transform: capitalize;
  }
  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  &__ampel {
    margin-inline-start: var(--space-1);
    padding-inline-start: var(--space-3);
    border-inline-start: 1px solid var(--color-border);
  }
}
</style>
