<script setup lang="ts">
import type { SecondFactorSetup } from '../composables/useAuth'

const props = defineProps<{ setup: SecondFactorSetup; busy: boolean; error: string | null }>()
const emit = defineEmits<{ submit: [code: string]; cancel: [] }>()
const { t } = useT()
const code = ref('')
const qr = computed(() => qrPath(props.setup.uri))
</script>

<template>
  <form class="login-factor" @submit.prevent="emit('submit', code.trim())">
    <h1 class="login__title">{{ t('secondFactor.setupTitle') }}</h1>
    <p class="login-factor__hint">{{ t('secondFactor.setupHint') }}</p>
    <svg class="login-factor__qr" :viewBox="`0 0 ${qr.size} ${qr.size}`" role="img" :aria-label="t('secondFactor.qrLabel')" shape-rendering="crispEdges">
      <rect :width="qr.size" :height="qr.size" fill="#fff" />
      <path :d="qr.d" fill="#000" />
    </svg>
    <p class="login-factor__hint">{{ t('secondFactor.manualHint') }}</p>
    <code class="login-factor__secret">{{ groupedSecret(props.setup.secret) }}</code>
    <KestrelUiAlert v-if="props.error" variant="error">{{ props.error }}</KestrelUiAlert>
    <KestrelUiField :label="t('secondFactor.code')">
      <template #default="f">
        <KestrelUiTextInput v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" v-bind="f" />
      </template>
    </KestrelUiField>
    <div class="login-factor__actions">
      <KestrelUiButton type="submit" variant="primary" :loading="props.busy">{{ t('secondFactor.confirmSetup') }}</KestrelUiButton>
      <KestrelUiButton type="button" variant="ghost" :disabled="props.busy" @click="emit('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
    </div>
  </form>
</template>

<style lang="scss">
.login-factor__qr {
  width: 12rem;
  height: 12rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.login-factor__secret {
  font-family: ui-monospace, monospace;
  font-size: var(--text-base);
  word-break: break-all;
}
</style>
