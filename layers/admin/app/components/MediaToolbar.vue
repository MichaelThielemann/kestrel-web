<script setup lang="ts">
import { computed, ref } from 'vue'
import type { IconName } from '#kestrel-admin/utils/icons'

type View = 'grid' | 'table'

const props = defineProps<{ view: View; search: string; disabled?: boolean }>()
const emit = defineEmits<{
  'update:view': [View]
  'update:search': [string]
  upload: [File[]]
  'new-folder': []
}>()

const { t } = useT()

const VIEW_OPTIONS = computed<{ label: string; value: string; icon: IconName }[]>(() => [
  { label: t('mediaToolbar.viewGrid'), value: 'grid', icon: 'layout-grid' },
  { label: t('mediaToolbar.viewTable'), value: 'table', icon: 'table' },
])

function isView(value: string): value is View {
  return value === 'grid' || value === 'table'
}

const viewModel = computed<string | string[] | null>({
  get: () => props.view,
  set: (v) => { if (typeof v === 'string' && isView(v)) emit('update:view', v) },
})

const fileInput = ref<{ open: () => void } | null>(null)
</script>

<template>
  <div class="media-toolbar">
    <KestrelUiTextInput
      class="media-toolbar__search"
      :model-value="search"
      type="search"
      :placeholder="t('mediaToolbar.searchPlaceholder')"
      :aria-label="t('mediaToolbar.searchAriaLabel')"
      @update:model-value="(v) => emit('update:search', v ?? '')"
    />

    <div class="media-toolbar__actions">
      <KestrelUiButtonGroup v-model="viewModel" :options="VIEW_OPTIONS" :aria-label="t('mediaToolbar.viewAriaLabel')" />
      <span class="media-toolbar__divider" aria-hidden="true"></span>
      <KestrelUiFileInput ref="fileInput" multiple class="media-toolbar__file" :aria-label="t('mediaToolbar.upload')" @select="(files) => emit('upload', files)" />
      <KestrelUiButton :disabled="disabled" @click="fileInput?.open()"><KestrelUiIcon name="upload" :size="16" /> {{ t('mediaToolbar.upload') }}</KestrelUiButton>
      <KestrelUiButton :disabled="disabled" @click="emit('new-folder')"><KestrelUiIcon name="folder-plus" :size="16" /> {{ t('mediaToolbar.newFolder') }}</KestrelUiButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.media-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  row-gap: var(--space-2);
  align-items: center;

  &__search {
    flex: 1 1 16rem;
    min-width: 0;
    max-width: 24rem;
    margin-right: auto;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__divider {
    align-self: stretch;
    width: 1px;
    min-height: 1.5rem;
    background: var(--color-border);
    margin: 0 var(--space-1);
  }

  &__file {
    display: none;
  }
}
</style>
