<script setup lang="ts">
withDefaults(defineProps<{ id: string; variant?: 'icon' | 'ghost'; size?: 'sm' | 'md' }>(), { variant: 'icon', size: 'md' })

const { t } = useT()
const toast = useToast()

async function copy(id: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText !== 'function') {
    toast.error(t('error.idCopyFailed'))
    return
  }
  try {
    await navigator.clipboard.writeText(id)
    toast.success(t('error.idCopied'))
  }
  catch {
    toast.error(t('error.idCopyFailed'))
  }
}
</script>

<template>
  <KestrelUiTooltip>
    <KestrelUiButton
      :variant="variant"
      :size="size"
      icon="copy"
      :aria-label="t('error.idCopy', { id })"
      @click="copy(id)"
    />
    <template #content>{{ t('error.idCopy', { id }) }}</template>
  </KestrelUiTooltip>
</template>
