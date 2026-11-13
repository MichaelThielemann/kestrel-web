<script setup lang="ts">

defineProps<{ count: number; hasWorkflow: boolean; canUpdate: boolean; canDelete: boolean; busy: boolean }>()
const emit = defineEmits<{ setStatus: [live: boolean]; delete: []; clear: [] }>()

const { t } = useT()
</script>

<template>
  <KestrelUiBulkBar :label="t('list.selected', { n: count })" :clear-label="t('list.clearSelection')" :busy="busy" @clear="emit('clear')">
    <template v-if="hasWorkflow && canUpdate">
      <KestrelUiButton type="button" size="sm" variant="ghost" :disabled="busy" @click="emit('setStatus', true)">{{ t('list.bulkPublish') }}</KestrelUiButton>
      <KestrelUiButton type="button" size="sm" variant="ghost" :disabled="busy" @click="emit('setStatus', false)">{{ t('list.bulkUnpublish') }}</KestrelUiButton>
    </template>
    <KestrelUiButton v-if="canDelete" type="button" size="sm" variant="danger-ghost" :disabled="busy" @click="emit('delete')">{{ t('list.bulkDelete') }}</KestrelUiButton>
  </KestrelUiBulkBar>
</template>
