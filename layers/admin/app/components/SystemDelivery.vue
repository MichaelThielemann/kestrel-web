<script setup lang="ts">
import { exportMedia, publishAll } from '#kestrel-admin/actions/system'
import type { ActionDeps } from '#kestrel-admin/actions/types'

const { t } = useT()
const api = useApi()
const toast = useToast()
const { isAdmin } = useAuth()

const deps: ActionDeps = { api, t, toast }

const busy = ref(false)
const exporting = ref(false)

function onPublishAll() {
  return runAction(publishAll, { deps, ops: { setBusy: (on) => { busy.value = on }, busy: () => busy.value } })
}

function onExportMedia() {
  return runAction(exportMedia, { deps, ops: { setBusy: (on) => { exporting.value = on }, busy: () => exporting.value } })
}
</script>

<template>
  <section class="delivery">
    <div class="delivery__section">
      <div class="delivery__section-head">
        <h2 class="delivery__section-title">{{ t('delivery.title') }}</h2>
        <KestrelUiButton type="button" size="sm" variant="secondary" :loading="busy" @click="onPublishAll">{{ t('delivery.publishAll') }}</KestrelUiButton>
      </div>
      <p class="delivery__desc">{{ t('delivery.desc') }}</p>
    </div>
    <div v-if="isAdmin" class="delivery__section">
      <div class="delivery__section-head">
        <h2 class="delivery__section-title">{{ t('delivery.exportTitle') }}</h2>
        <KestrelUiButton type="button" size="sm" variant="secondary" :loading="exporting" @click="onExportMedia">{{ t('delivery.export') }}</KestrelUiButton>
      </div>
      <p class="delivery__desc">{{ t('delivery.exportDesc') }}</p>
    </div>
  </section>
</template>

<style lang="scss">
.delivery {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  overflow: hidden;
  flex: 1 1 auto;

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  &__section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
  &__desc {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
}
</style>
