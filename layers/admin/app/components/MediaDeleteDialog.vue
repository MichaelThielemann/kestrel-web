<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ReferenceTo } from '#kestrel-admin/types/api'
import { humanizeSize } from '../utils/library'
import type { DeleteSummary } from '../utils/ops'

const props = defineProps<{ open: boolean; summary: DeleteSummary | null; busy?: boolean; error?: string | null; conflict?: ReferenceTo[] | null }>()
const emit = defineEmits<{ confirm: [boolean]; 'update:open': [boolean] }>()

const { t } = useT()
const REF_PREVIEW = 5
const shownRefs = computed(() => props.summary?.references.slice(0, REF_PREVIEW) ?? [])
const extraRefs = computed(() => Math.max(0, (props.summary?.references.length ?? 0) - REF_PREVIEW))
const hasNonEmptyFolders = computed(() => !!props.summary?.nonEmptyFolders.length)
const hasConflict = computed(() => !!props.conflict?.length)
const recursive = ref(false)
watch(() => props.open, (o) => { if (o) recursive.value = false })
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('common.delete')" @update:open="(v) => emit('update:open', v)">
    <p v-if="summary">
      {{ t('media.deleteSummary', {
        files: summary.files,
        filesUnit: summary.files === 1 ? t('media.file') : t('media.files'),
        folders: summary.folders,
        foldersUnit: summary.folders === 1 ? t('media.folder') : t('media.folders'),
        size: humanizeSize(summary.totalBytes)
      }) }}
    </p>
    <div v-if="summary && summary.references.length" class="media-delete__refs">
      <p>{{ t('refs.referencedBy', { n: summary.references.length }) }}</p>
      <KestrelReferrerList :refs="shownRefs" />
      <p v-if="extraRefs > 0" class="media-delete__more">{{ t('refs.referencedByMore', { n: extraRefs }) }}</p>
    </div>
    <p class="media-delete__hint">{{ t('media.deleteHint') }}</p>
    <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- native wrapping label around a custom UiCheckbox; no `for`/`id` pair needed, invisible to static analysis -->
    <label v-if="hasNonEmptyFolders" class="media-delete__recursive">
      <KestrelUiCheckbox v-model="recursive" :disabled="busy" />
      <span>{{ t('media.deleteRecursive') }}</span>
    </label>
    <div v-if="hasConflict" class="media-delete__refs">
      <p>{{ t('refs.conflictAfterPrecheck') }}</p>
      <KestrelReferrerList :refs="conflict ?? []" />
    </div>
    <KestrelUiAlert v-else-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="emit('update:open', false)">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="danger" :disabled="busy" @click="emit('confirm', recursive)">{{ t('common.delete') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.media-delete__hint {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.media-delete__refs {
  margin-top: var(--space-2);
  color: var(--color-danger);
  font-size: var(--text-sm);

  ul {
    margin: var(--space-1) 0 0;
    padding-inline-start: var(--space-4);
  }
}
.media-delete__more {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}
.media-delete__recursive {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
