<script setup lang="ts">
import type { User } from '#kestrel-admin/types/api'
import { userErrorMessage } from '../utils/user-errors'

const props = defineProps<{ user: User | null; enrolled: boolean }>()
const emit = defineEmits<{ 'update:user': [User | null], reset: [] }>()

const { t } = useT()
const deps = useActionDeps()
const busy = ref(false)
const error = ref<string | null>(null)
const enrollmentCode = ref<string | null>(null)
const open = computed(() => props.user !== null)
const resetsFactor = ref(props.enrolled)
watch(() => props.user, (user) => { if (user !== null) resetsFactor.value = props.enrolled })
const text = computed(() => resetsFactor.value
  ? { operation: 'resetFactor', title: 'users.resetSecondFactorTitle', confirm: 'users.resetSecondFactorConfirm', action: 'users.resetSecondFactor', done: 'users.resetSecondFactorDone' } as const
  : { operation: 'issueEnrollmentCode', title: 'users.issueEnrollmentCodeTitle', confirm: 'users.issueEnrollmentCodeConfirm', action: 'users.issueEnrollmentCode', done: 'users.issueEnrollmentCodeDone' } as const)

function close() {
  error.value = null
  enrollmentCode.value = null
  emit('update:user', null)
}

async function confirm() {
  if (props.user === null) return
  busy.value = true
  error.value = null
  try {
    const answer = await deps.api<{ enrollmentCode: string }>(deps.capabilities.route('resetSecondFactor', { id: props.user.id }))
    enrollmentCode.value = answer.enrollmentCode
    deps.toast.success(t(text.value.done))
    emit('reset')
  } catch (e) {
    const err = toApiError(e)
    error.value = failureText(t, userErrorMessage(t, text.value.operation, err), err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <KestrelUiDialog :open="open" :title="t(text.title)" @update:open="(v) => { if (!v) close() }">
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <template v-if="enrollmentCode === null">
      <p>{{ t(text.confirm, { username: props.user?.username ?? '' }) }}</p>
    </template>
    <template v-else>
      <p>{{ t('users.enrollmentCodeHint', { username: props.user?.username ?? '' }) }}</p>
      <p><code class="user-reset-factor__code">{{ enrollmentCode }}</code></p>
    </template>
    <template #footer>
      <template v-if="enrollmentCode === null">
        <KestrelUiButton variant="ghost" :disabled="busy" @click="close">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton variant="danger" :loading="busy" @click="confirm">{{ t(text.action) }}</KestrelUiButton>
      </template>
      <KestrelUiButton v-else variant="primary" @click="close">{{ t('users.enrollmentCodeDone') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss">
.user-reset-factor__code {
  font-family: ui-monospace, monospace;
  font-size: var(--text-base);
  word-break: break-all;
}
</style>
