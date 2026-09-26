<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ open: boolean; multiple?: boolean; accept?: 'image' | 'any'; initialFolder?: string; initialSelected?: string[] }>()
const emit = defineEmits<{ confirm: [string[]]; 'update:open': [boolean] }>()
const { t } = useT()

const effectiveInitialFolder = computed(() => props.initialFolder ?? getLastMediaFolder())
</script>

<template>
  <KestrelUiDialog :open="open" size="screen" :title="multiple ? t('media.picker.titleMultiple') : t('media.picker.titleSingle')" @update:open="(v) => emit('update:open', v)">
    <KestrelMediaLibrary
      pick
      :multiple="multiple"
      :accept="accept ?? 'any'"
      :initial-folder="effectiveInitialFolder"
      :initial-selected="initialSelected"
      @confirm="(ids) => { emit('confirm', ids); emit('update:open', false) }"
      @cancel="emit('update:open', false)"
    />
  </KestrelUiDialog>
</template>
