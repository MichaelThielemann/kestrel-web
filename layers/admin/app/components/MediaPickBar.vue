<script setup lang="ts">
defineProps<{ count: number; blocked: boolean; confirming: boolean; refusal: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useT()
</script>

<template>
  <div class="media-pick-bar">
    <KestrelUiAlert v-if="refusal" variant="warning">{{ refusal }}</KestrelUiAlert>
    <div class="media-pick-bar__actions">
      <span>{{ count === 1 ? t('media.pick.count') : t('media.pick.countPlural', { n: count }) }}</span>
      <KestrelUiButton variant="primary" :disabled="!count || blocked" :loading="confirming" @click="emit('confirm')">{{ t('media.useSelected') }}</KestrelUiButton>
      <KestrelUiButton variant="ghost" @click="emit('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.media-pick-bar { display: flex; flex-direction: column; gap: var(--space-3); border-top: 1px solid var(--color-border); padding-top: var(--space-3); }
.media-pick-bar__actions { display: flex; align-items: center; gap: var(--space-3); justify-content: flex-end; }
</style>
