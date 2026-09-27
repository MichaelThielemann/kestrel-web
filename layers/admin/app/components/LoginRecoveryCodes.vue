<script setup lang="ts">
const props = defineProps<{ codes: string[] }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useT()
const kept = ref(false)
</script>

<template>
  <section class="login-factor" aria-labelledby="recovery-title">
    <h1 id="recovery-title" class="login__title">{{ t('secondFactor.recoveryTitle') }}</h1>
    <p class="login-factor__hint">{{ t('secondFactor.recoveryHint') }}</p>
    <ul class="login-recovery">
      <li v-for="code in props.codes" :key="code"><code>{{ code }}</code></li>
    </ul>
    <label class="login-recovery__kept">
      <KestrelUiCheckbox v-model="kept" />
      <span>{{ t('secondFactor.recoveryKept') }}</span>
    </label>
    <KestrelUiButton variant="primary" :disabled="!kept" @click="emit('done')">{{ t('secondFactor.continue') }}</KestrelUiButton>
  </section>
</template>

<style lang="scss">
.login-recovery {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
  font-family: ui-monospace, monospace;

  &__kept {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
}
</style>
