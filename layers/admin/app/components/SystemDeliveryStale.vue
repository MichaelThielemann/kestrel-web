<script setup lang="ts">
import { publishAll, retryStale } from '#kestrel-admin/actions/system'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { BusyPort } from '#kestrel-admin/actions/types'
import type { IconName } from '../utils/icons'

type Tone = 'waiting' | 'failed' | 'unknown' | 'current'

interface StaleLine { tone: Tone, icon: IconName, text: string }

const { t } = useT()
const deps = useActionDeps()
const stale = useStaleStatus()
const { status, loadError, available, progress } = stale

const publishing = ref(false)
const retrying = ref(false)
const canRetry = computed(() => deps.capabilities.has('retryStalePages'))

const progressText = computed(() => (progress.value ? t('delivery.progressValue', { done: progress.value.done, total: progress.value.total }) : ''))

const lines = computed<StaleLine[]>(() => {
  const current = status.value
  if (!current) return []
  const result: StaleLine[] = []
  if (current.stale > 0) result.push({ tone: 'waiting', icon: 'clock', text: t('delivery.waiting', { n: current.stale }) })
  if (current.failed > 0) result.push({ tone: 'failed', icon: 'triangle-alert', text: t('delivery.failedRenders', { n: current.failed }) })
  if (current.unknown > 0) result.push({ tone: 'unknown', icon: 'info', text: t('delivery.unknown', { n: current.unknown }) })
  if (result.length === 0) result.push({ tone: 'current', icon: 'check', text: t('delivery.upToDate') })
  return result
})

function busyPort(flag: Ref<boolean>): BusyPort {
  return { setBusy: (on) => { flag.value = on }, busy: () => flag.value }
}

async function onPublishAll() {
  const result = await runAction(publishAll, { deps, ops: busyPort(publishing) })
  toastUnexpected(deps, result)
  if (result.ok) await stale.watch(result.result?.marked)
}

async function onRetry() {
  const result = await runAction(retryStale, { deps, ops: busyPort(retrying) })
  toastUnexpected(deps, result)
  if (result.ok) await stale.watch(result.result?.retried)
}
</script>

<template>
  <div class="delivery__section">
    <div class="delivery__section-head">
      <h2 class="delivery__section-title">{{ t('delivery.title') }}</h2>
      <KestrelUiButton type="button" size="sm" variant="secondary" :loading="publishing" @click="onPublishAll">{{ t('delivery.publishAll') }}</KestrelUiButton>
    </div>
    <p class="delivery__desc">{{ t('delivery.desc') }}</p>
    <template v-if="available">
      <div class="delivery-stale" role="status" aria-live="polite">
        <p v-if="loadError" class="delivery-stale__line" data-tone="failed">
          <KestrelUiIcon name="triangle-alert" :size="16" />
          <span>{{ t('delivery.staleLoadError') }} {{ loadError }}</span>
        </p>
        <p v-for="line in lines" :key="line.tone" class="delivery-stale__line" :data-tone="line.tone">
          <KestrelUiIcon :name="line.icon" :size="16" />
          <span>{{ line.text }}</span>
        </p>
        <p v-if="progress" class="delivery-stale__progress-text">{{ progressText }}</p>
      </div>
      <KestrelUiProgress v-if="progress" :value="progress.percent" :label="t('delivery.progress')" :value-text="progressText" />
      <div v-if="canRetry && (status?.failed ?? 0) > 0" class="delivery-stale__actions">
        <KestrelUiButton type="button" size="sm" variant="secondary" icon="rotate-cw" :loading="retrying" @click="onRetry">{{ t('delivery.retryFailed') }}</KestrelUiButton>
      </div>
    </template>
  </div>
</template>

<style lang="scss">
.delivery-stale {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  &__line {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text);

    > svg {
      flex: none;
      margin-top: 0.125rem;
    }

    &[data-tone='waiting'] > svg {
      color: var(--color-warning);
    }

    &[data-tone='failed'] > svg {
      color: var(--color-danger);
    }

    &[data-tone='current'] > svg {
      color: var(--color-success);
    }

    &[data-tone='unknown'] > svg {
      color: var(--color-text-muted);
    }
  }

  &__progress-text {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__actions {
    display: flex;
    justify-content: flex-start;
  }
}
</style>
