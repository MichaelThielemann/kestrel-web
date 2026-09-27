<script setup lang="ts">
import type { User } from '#kestrel-admin/types/api'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ 'update:user': [User | null], reset: [] }>()

const { t } = useT()
const deps = useActionDeps()
const busy = ref(false)
const error = ref<string | null>(null)
const open = computed(() => props.user !== null)

function close() {
  error.value = null
  emit('update:user', null)
}

async function confirm() {
  if (props.user === null) return
  busy.value = true
  error.value = null
  try {
    await deps.api(deps.capabilities.route('resetSecondFactor', { id: props.user.id }))
    deps.toast.success(t('users.resetSecondFactorDone'))
    emit('reset')
    close()
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('users.resetSecondFactorTitle')" @update:open="(v) => { if (!v) close() }">
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <p>{{ t('users.resetSecondFactorConfirm', { username: props.user?.username ?? '' }) }}</p>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="danger" :loading="busy" @click="confirm">{{ t('users.resetSecondFactor') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>
