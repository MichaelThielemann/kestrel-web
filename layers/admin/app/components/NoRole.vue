<script setup lang="ts">
const { t } = useT()
const { username, logout } = useAuth()
const busy = ref(false)

async function signOut() {
  busy.value = true
  try {
    await logout()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="admin-portal">
    <main class="no-role">
      <section class="no-role__panel" aria-labelledby="no-role-title">
        <h1 id="no-role-title" class="no-role__title">{{ t('noRole.title') }}</h1>
        <p class="no-role__message">{{ t('noRole.message', { username }) }}</p>
        <KestrelUiButton variant="primary" :loading="busy" @click="signOut">{{ t('nav.signOut') }}</KestrelUiButton>
      </section>
    </main>
  </div>
</template>

<style lang="scss">
.no-role {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100svh;
  padding: var(--space-5);
  background: var(--color-bg);

  &__panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    max-width: 32rem;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--color-text);
  }

  &__message {
    color: var(--color-text);
  }
}
</style>
