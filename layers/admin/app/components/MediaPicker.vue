<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ open: boolean; multiple?: boolean; accept?: 'image' | 'any'; initialFolder?: string; initialSelected?: string[] }>()
const emit = defineEmits<{ confirm: [string[]]; 'update:open': [boolean] }>()
const { t } = useT()

const startFolder = ref('')
watch(() => props.open, (open) => {
  if (open) startFolder.value = props.initialFolder ?? getLastMediaFolder()
}, { immediate: true })
const library = ref<{ clearSelection: () => boolean } | null>(null)

function onEscape(e: KeyboardEvent) {
  if (library.value?.clearSelection()) e.preventDefault()
}
</script>

<template>
  <KestrelUiDialog :open="open" size="screen" :title="multiple ? t('media.picker.titleMultiple') : t('media.picker.titleSingle')" @update:open="(v) => emit('update:open', v)" @escape-key-down="onEscape">
    <KestrelMediaLibrary
      ref="library"
      pick
      :multiple="multiple"
      :accept="accept ?? 'any'"
      :initial-folder="startFolder"
      :initial-selected="initialSelected"
      @confirm="(ids) => { emit('confirm', ids); emit('update:open', false) }"
      @cancel="emit('update:open', false)"
    />
  </KestrelUiDialog>
</template>
