<script setup lang="ts">
import { exportMedia, repairPublicMedia } from '#kestrel-admin/actions/system'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'

const { t } = useT()
const deps = useActionDeps()

const exporting = ref(false)
const repairing = ref(false)

async function onExportMedia() {
  const result = await runAction(exportMedia, { deps, ops: { setBusy: (on) => { exporting.value = on }, busy: () => exporting.value } })
  toastUnexpected(deps, result)
}

async function onRepairPublicMedia() {
  const result = await runAction(repairPublicMedia, { deps, ops: { setBusy: (on) => { repairing.value = on }, busy: () => repairing.value } })
  toastUnexpected(deps, result)
}
</script>

<template>
  <section class="delivery">
    <KestrelSystemDeliveryStale />
    <div v-if="deps.capabilities.has('repairPublicMedia')" class="delivery__section">
      <div class="delivery__section-head">
        <h2 class="delivery__section-title">{{ t('delivery.repairPublic') }}</h2>
        <KestrelUiButton type="button" size="sm" variant="secondary" :loading="repairing" @click="onRepairPublicMedia">{{ t('delivery.repairPublic') }}</KestrelUiButton>
      </div>
      <p class="delivery__desc">{{ t('delivery.repairPublicDesc') }}</p>
    </div>
    <div v-if="deps.capabilities.has('exportMedia')" class="delivery__section">
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
