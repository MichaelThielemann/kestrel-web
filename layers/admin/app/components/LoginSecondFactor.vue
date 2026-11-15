<script setup lang="ts">
const props = defineProps<{ busy: boolean; error: string | null }>()
const emit = defineEmits<{ submit: [code: string]; cancel: [] }>()
const { t } = useT()
const code = ref('')
</script>

<template>
  <form class="login-factor" @submit.prevent="emit('submit', compactCode(code))">
    <h1 class="login__title">{{ t('secondFactor.title') }}</h1>
    <p class="login-factor__hint">{{ t('secondFactor.codeHint') }}</p>
    <KestrelUiAlert v-if="props.error" variant="error">{{ props.error }}</KestrelUiAlert>
    <KestrelUiField :label="t('secondFactor.code')">
      <template #default="f">
        <KestrelUiTextInput v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" v-bind="f" />
      </template>
    </KestrelUiField>
    <div class="login-factor__actions">
      <KestrelUiButton type="submit" variant="primary" :loading="props.busy">{{ t('secondFactor.confirm') }}</KestrelUiButton>
      <KestrelUiButton type="button" variant="ghost" :disabled="props.busy" @click="emit('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
    </div>
  </form>
</template>

<style lang="scss">
.login-factor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__hint {
    color: var(--color-text-muted);
  }

  &__actions {
    display: flex;
    gap: var(--space-2);
  }
}
</style>
