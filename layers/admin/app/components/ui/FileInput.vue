<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    multiple?: boolean
    accept?: string
    disabled?: boolean
  }>(),
  { multiple: false, disabled: false },
)

const emit = defineEmits<{ select: [File[]] }>()

const el = ref<HTMLInputElement | null>(null)

function onChange() {
  const input = el.value
  if (!input) return
  emit('select', Array.from(input.files ?? []))
  input.value = ''
}

defineExpose({ open: () => el.value?.click() })
</script>

<template>
  <input
    ref="el"
    type="file"
    :multiple="multiple"
    :accept="accept"
    :disabled="disabled"
    class="ui-file-input"
    v-bind="$attrs"
    @change="onChange"
  >
</template>

<style lang="scss">
:where(.ui-file-input) {
  display: none;
}
</style>
