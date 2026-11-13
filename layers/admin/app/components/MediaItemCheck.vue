<script setup lang="ts">
import type { SelectMods } from '../composables/useMediaSelection'

defineProps<{ selected: boolean; label: string; disabled?: boolean }>()
const emit = defineEmits<{ select: [SelectMods] }>()

let range = false
function onClick(e: MouseEvent) { range = e.shiftKey }
function onChange() {
  emit('select', { toggle: !range, range })
  range = false
}
</script>

<template>
  <KestrelUiCheckbox standalone tabindex="-1" :model-value="selected" :disabled="disabled" :aria-label="label" @click="onClick" @update:model-value="onChange" />
</template>
