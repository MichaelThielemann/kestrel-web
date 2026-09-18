<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { t } = useT()
const route = useRoute()
const { error: sessionError, checkSession, login } = useAuth()
const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)
const retrying = ref(false)

async function submit() {
  loading.value = true
  error.value = null
  try {
    await login(username.value, password.value)
    await navigateTo(safeRedirect(route.query.redirect) ?? '/admin')
  } catch (e: unknown) {
    const code = apiErrorCode(e)
    error.value = code === 'UNAUTHENTICATED' ? t('login.invalid') : code === 'RATE_LIMITED' ? t('login.tooMany') : t('login.error')
  } finally {
    loading.value = false
  }
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
  <form v-else class="login" @submit.prevent="submit">
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
