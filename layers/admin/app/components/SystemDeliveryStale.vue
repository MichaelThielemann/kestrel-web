<script setup lang="ts">
import { publishAll, retryStale } from '#kestrel-admin/actions/system'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import type { BusyPort } from '#kestrel-admin/actions/types'
import { staleLines, staleProgressText } from '../utils/stale-messages'

const { t } = useT()
const deps = useActionDeps()
const stale = useStaleStatus()
const { status, loadError, announcement, available, progress } = stale

const publishing = ref(false)
const retrying = ref(false)
const canRetry = computed(() => deps.capabilities.has('retryStalePages'))

const progressText = computed(() => (progress.value ? staleProgressText(t, progress.value) : ''))
const lines = computed(() => (status.value ? staleLines(t, status.value) : []))

const { collections } = useCollections()

function busyPort(flag: Ref<boolean>): BusyPort {
  return { setBusy: (on) => { flag.value = on }, busy: () => flag.value }
}

async function onPublishAll() {
  const result = await runAction(publishAll, { deps, ops: busyPort(publishing), collections: collections.value.map((entry) => entry.name) })
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
      <p class="delivery-stale__live" role="status" aria-live="polite">{{ announcement }}</p>
      <div class="delivery-stale">
        <p v-if="loadError" class="delivery-stale__line" data-tone="failed" role="alert">
          <KestrelUiIcon name="triangle-alert" :size="16" />
          <span>{{ loadError }}</span>
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
      <KestrelSystemDeliveryExports v-if="status" :exports="status.exports" />
    </template>
  </div>
</template>

<style lang="scss">
@use '../assets/scss/mixins';

.delivery-stale__live { @include mixins.sr-only; }

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
