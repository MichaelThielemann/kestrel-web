<script setup lang="ts">
const { t } = useT()
const reauth = useReauth()
const api = useAdminApi()
const capabilities = useCapabilities()

const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

const stopReset = watch(reauth.open, (open) => {
  if (!open) {
    password.value = ''
    error.value = null
  }
})
onUnmounted(() => stopReset())

async function submit() {
  error.value = null
  if (password.value === '') { error.value = t('reauth.required'); return }
  busy.value = true
  try {
    await api(capabilities.route('confirmPassword'), { body: { password: password.value } })
    reauth.settle(true)
  } catch (e) {
    error.value = apiErrorStatus(e) === 400 ? t('reauth.wrong') : apiErrorText(t, e)
  } finally {
    busy.value = false
  }
}

function onOpen(open: boolean) {
  if (!open) reauth.settle(false)
}
</script>

<template>
  <KestrelUiDialog :open="reauth.open.value" :title="t('reauth.title')" nested @update:open="onOpen">
    <form class="reauth" @submit.prevent="submit">
      <p class="reauth__intro">{{ t('reauth.intro') }}</p>
      <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
      <KestrelUiField :label="t('reauth.password')">
        <template #default="f">
          <KestrelUiTextInput v-model="password" type="password" autocomplete="current-password" v-bind="f" />
        </template>
      </KestrelUiField>
    </form>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="reauth.settle(false)">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="primary" :loading="busy" @click="submit">{{ t('reauth.confirm') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.reauth {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.reauth__intro {
  margin: 0;
}
</style>
