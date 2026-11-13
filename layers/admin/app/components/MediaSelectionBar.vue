<script setup lang="ts">
import { computed } from 'vue'

defineProps<{ label: string; pageCount: number; allSelected: boolean; canDelete: boolean; trash?: boolean; busy?: boolean }>()
const emit = defineEmits<{ selectAll: []; clear: []; delete: [] }>()
const { t } = useT()

const clearShortcut = computed(() => ({ keys: 'Escape', label: t('media.selection.keyEscape') }))
</script>

<template>
  <div class="media-selection-bar">
    <KestrelUiBulkBar :label="label" :clear-label="t('media.selection.clear')" :clear-shortcut="clearShortcut" :busy="busy" @clear="emit('clear')">
      <template #extra>
        <KestrelUiTooltip v-if="!allSelected">
          <KestrelUiButton size="sm" variant="ghost" aria-keyshortcuts="Control+A Meta+A" @click="emit('selectAll')">{{ t('media.selection.selectAllOnPage', { n: pageCount }) }}</KestrelUiButton>
          <template #content><kbd class="ui-bulkbar__kbd">{{ t('media.selection.keySelectAll') }}</kbd></template>
        </KestrelUiTooltip>
      </template>
      <KestrelUiTooltip v-if="canDelete">
        <KestrelUiButton size="sm" variant="danger-ghost" icon="trash" :disabled="busy" aria-keyshortcuts="Delete Backspace" @click="emit('delete')">{{ trash ? t('media.selection.trash') : t('media.selection.delete') }}</KestrelUiButton>
        <template #content><kbd class="ui-bulkbar__kbd">{{ t('media.selection.keyDelete') }}</kbd></template>
      </KestrelUiTooltip>
    </KestrelUiBulkBar>
  </div>
</template>

<style lang="scss" scoped>
.media-selection-bar {
  display: flex;
  align-items: center;
  min-height: 2.5rem;
}
</style>
