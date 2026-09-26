<script setup lang="ts">
import { computed, ref } from 'vue'
import type { IconName } from '#kestrel-admin/utils/icons'
import { parseMediaTypeFilter, type MediaTypeFilter } from '../utils/library'

type View = 'grid' | 'table'

const props = defineProps<{
  view: View
  search: string
  status?: string
  disabled?: boolean
  canUpload: boolean
  canCreateFolder: boolean
  typeFilter?: MediaTypeFilter
  accept?: 'image' | 'any'
}>()
const emit = defineEmits<{
  'update:view': [View]
  'update:search': [string]
  'update:typeFilter': [MediaTypeFilter]
  upload: [File[]]
  'new-folder': []
}>()

const { t } = useT()

const VIEW_OPTIONS = computed<{ label: string; value: string; icon: IconName }[]>(() => [
  { label: t('mediaToolbar.viewGrid'), value: 'grid', icon: 'layout-grid' },
  { label: t('mediaToolbar.viewTable'), value: 'table', icon: 'table' },
])

const TYPE_FILTER_OPTIONS = computed<{ label: string; value: MediaTypeFilter }[]>(() => (
  props.accept === 'image'
    ? [{ label: t('mediaToolbar.filterImages'), value: 'image' }]
    : [
        { label: t('mediaToolbar.filterAll'), value: 'all' },
        { label: t('mediaToolbar.filterImages'), value: 'image' },
        { label: t('mediaToolbar.filterVideos'), value: 'video' },
        { label: t('mediaToolbar.filterOther'), value: 'other' },
      ]
))

const typeFilterModel = computed<string | string[] | null>({
  get: () => props.typeFilter ?? 'all',
  set: (v) => { if (typeof v === 'string') emit('update:typeFilter', parseMediaTypeFilter(v)) },
})

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
    <div class="media-toolbar__search">
      <KestrelUiTextInput
        :model-value="search"
        type="search"
        :placeholder="t('mediaToolbar.searchPlaceholder')"
        :aria-label="t('mediaToolbar.searchAriaLabel')"
        @update:model-value="(v) => emit('update:search', v ?? '')"
      />
    </div>

    <div class="media-toolbar__filter" role="group" :aria-label="t('mediaToolbar.filterAriaLabel')">
      <KestrelUiButtonGroup v-model="typeFilterModel" :options="TYPE_FILTER_OPTIONS" :aria-label="t('mediaToolbar.filterAriaLabel')" />
    </div>

    <p class="media-toolbar__status" role="status" aria-live="polite">{{ status }}</p>

    <div class="media-toolbar__actions">
      <KestrelUiButtonGroup v-model="viewModel" :options="VIEW_OPTIONS" :aria-label="t('mediaToolbar.viewAriaLabel')" />
      <template v-if="canUpload || canCreateFolder">
        <span class="media-toolbar__divider" aria-hidden="true"></span>
        <template v-if="canUpload">
          <KestrelUiFileInput ref="fileInput" multiple @select="(files) => emit('upload', files)" />
          <KestrelUiButton :disabled="disabled" @click="fileInput?.open()"><KestrelUiIcon name="upload" :size="16" /> {{ t('mediaToolbar.upload') }}</KestrelUiButton>
        </template>
        <KestrelUiButton v-if="canCreateFolder" :disabled="disabled" @click="emit('new-folder')"><KestrelUiIcon name="folder-plus" :size="16" /> {{ t('mediaToolbar.newFolder') }}</KestrelUiButton>
      </template>
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
    flex: 0 1 24rem;
    min-width: 8rem;
  }

  &__status {
    flex: 1 1 auto;
    min-width: 0;
    margin-inline-start: auto;
    text-align: end;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
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
}
</style>
