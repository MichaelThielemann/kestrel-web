<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue'

const props = defineProps<{
  nodeProps: Record<string, unknown> | undefined
  editable?: boolean
  label: string
}>()

const failure = ref<string | null>(null)

onErrorCaptured((err) => {
  failure.value = err instanceof Error ? err.message : String(err)
  return false
})

watch(() => props.nodeProps, () => { failure.value = null }, { deep: true })
</script>

<template>
  <p v-if="failure && editable" class="block-marker__error" role="alert">{{ label }} {{ failure }}</p>
  <slot v-else-if="!failure" />
</template>
