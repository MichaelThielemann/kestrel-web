<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const { t } = useT()
const { changePassword } = useAuth()
const toast = useToast()

const current = ref('')
const next = ref('')
const confirm = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

function reset() {
  current.value = ''
  next.value = ''
  confirm.value = ''
  error.value = null
}
watch(open, (v) => { if (!v) reset() })

async function submit() {
  error.value = null
  if (next.value.length < 8) { error.value = t('account.password.tooShort'); return }
  if (next.value !== confirm.value) { error.value = t('account.password.mismatch'); return }
  busy.value = true
  try {
    await changePassword(current.value, next.value)
    toast.success(t('account.password.success'))
    open.value = false
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('account.password.title')" @update:open="(v) => (open = v)">
    <form class="change-password" @submit.prevent="submit">
      <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
      <KestrelUiField :label="t('account.password.current')">
        <template #default="f">
          <KestrelUiTextInput v-model="current" type="password" autocomplete="current-password" v-bind="f" />
        </template>
      </KestrelUiField>
      <KestrelUiField :label="t('account.password.new')">
        <template #default="f">
          <KestrelUiTextInput v-model="next" type="password" autocomplete="new-password" v-bind="f" />
        </template>
      </KestrelUiField>
      <KestrelUiField :label="t('account.password.confirm')">
        <template #default="f">
          <KestrelUiTextInput v-model="confirm" type="password" autocomplete="new-password" v-bind="f" />
        </template>
      </KestrelUiField>
    </form>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="open = false">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="primary" :loading="busy" @click="submit">{{ t('common.save') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.change-password {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
