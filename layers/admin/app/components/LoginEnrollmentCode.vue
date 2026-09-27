<script setup lang="ts">
const props = defineProps<{ busy: boolean; error: string | null }>()
const emit = defineEmits<{ submit: [code: string]; cancel: [] }>()
const { t } = useT()
const code = ref('')
</script>

<template>
  <form class="login-factor" @submit.prevent="emit('submit', code.trim())">
    <h1 class="login__title">{{ t('secondFactor.enrollmentTitle') }}</h1>
    <p class="login-factor__hint">{{ t('secondFactor.enrollmentHint') }}</p>
    <KestrelUiAlert v-if="props.error" variant="error">{{ props.error }}</KestrelUiAlert>
    <KestrelUiField :label="t('secondFactor.enrollmentCode')">
      <template #default="f">
        <KestrelUiTextInput v-model="code" type="text" autocomplete="off" v-bind="f" />
      </template>
    </KestrelUiField>
    <div class="login-factor__actions">
      <KestrelUiButton type="submit" variant="primary" :loading="props.busy">{{ t('secondFactor.continue') }}</KestrelUiButton>
      <KestrelUiButton type="button" variant="ghost" :disabled="props.busy" @click="emit('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
    </div>
  </form>
</template>
