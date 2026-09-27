<script setup lang="ts">
import type { SecondFactorSetup } from '../../composables/useAuth'

definePageMeta({ layout: 'admin' })

type Stage = { kind: 'credentials' } | { kind: 'code' } | { kind: 'setup'; setup: SecondFactorSetup } | { kind: 'recovery'; codes: string[] }

const { t } = useT()
const route = useRoute()
const { error: sessionError, checkSession, login, startSecondFactorSetup } = useAuth()
const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)
const retrying = ref(false)
const stage = ref<Stage>({ kind: 'credentials' })

async function finish() {
  await useSchema().load()
  await navigateTo(safeRedirect(route.query.redirect) ?? '/admin')
}

function messageFor(e: unknown, code?: string): string {
  const reason = apiErrorCode(e)
  if (reason === 'UNAUTHENTICATED') return code === undefined ? t('login.invalid') : t('secondFactor.invalid')
  if (reason === 'RATE_LIMITED') return t('login.tooMany')
  return t('login.error')
}

async function signIn(code?: string) {
  loading.value = true
  error.value = null
  try {
    const answer = await login(username.value, password.value, code)
    if (answer.recoveryCodes !== undefined && answer.recoveryCodes.length > 0) stage.value = { kind: 'recovery', codes: answer.recoveryCodes }
    else await finish()
  } catch (e: unknown) {
    const reason = apiErrorCode(e)
    if (reason === 'SECOND_FACTOR_REQUIRED') stage.value = { kind: 'code' }
    else if (reason === 'SECOND_FACTOR_SETUP_REQUIRED') await beginSetup()
    else error.value = messageFor(e, code)
  } finally {
    loading.value = false
  }
}

async function beginSetup() {
  try {
    stage.value = { kind: 'setup', setup: await startSecondFactorSetup(username.value, password.value) }
  } catch (e: unknown) {
    error.value = messageFor(e)
    stage.value = { kind: 'credentials' }
  }
}

function restart() {
  password.value = ''
  error.value = null
  stage.value = { kind: 'credentials' }
}

async function retry() {
  retrying.value = true
  const ok = await checkSession()
  retrying.value = false
  if (ok) await navigateTo(safeRedirect(route.query.redirect) ?? '/admin')
}
</script>

<template>
  <div v-if="sessionError" class="login">
    <div class="login__brand">
      <KestrelUiBrand />
      <span class="login__brand-word">kestrel</span>
    </div>
    <h1 class="login__title">{{ t('login.signIn') }}</h1>
    <KestrelUiAlert variant="error">{{ t('login.backendUnreachable') }}</KestrelUiAlert>
    <KestrelUiButton variant="primary" :loading="retrying" @click="retry">{{ t('common.retry') }}</KestrelUiButton>
  </div>
  <div v-else-if="stage.kind !== 'credentials'" class="login">
    <div class="login__brand">
      <KestrelUiBrand />
      <span class="login__brand-word">kestrel</span>
    </div>
    <KestrelLoginSecondFactor v-if="stage.kind === 'code'" :busy="loading" :error="error" @submit="signIn" @cancel="restart" />
    <KestrelLoginSecondFactorSetup v-else-if="stage.kind === 'setup'" :setup="stage.setup" :busy="loading" :error="error" @submit="signIn" @cancel="restart" />
    <KestrelLoginRecoveryCodes v-else :codes="stage.codes" @done="finish" />
  </div>
  <form v-else class="login" @submit.prevent="signIn()">
    <div class="login__brand">
      <KestrelUiBrand />
      <span class="login__brand-word">kestrel</span>
    </div>
    <h1 class="login__title">{{ t('login.signIn') }}</h1>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <KestrelUiField :label="t('login.username')">
      <template #default="f">
        <KestrelUiTextInput
          v-model="username"
          type="text"
          autocomplete="username"
          v-bind="f"
        />
      </template>
    </KestrelUiField>
    <KestrelUiField :label="t('login.password')">
      <template #default="f">
        <KestrelUiTextInput
          v-model="password"
          type="password"
          autocomplete="current-password"
          v-bind="f"
        />
      </template>
    </KestrelUiField>
    <KestrelUiButton type="submit" variant="primary" :loading="loading">{{ t('login.signIn') }}</KestrelUiButton>
  </form>
</template>

<style lang="scss">
.login {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 22rem;
  margin-inline: auto;
  overflow-y: auto;

  &__brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
  &__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }
}
</style>
