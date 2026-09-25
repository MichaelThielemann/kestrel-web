<script setup lang="ts">
import type { StaleStatus } from '#kestrel-admin/types/api'

const { t } = useT()
const api = useAdminApi()
const capabilities = useCapabilities()

const status = ref<StaleStatus | null>(null)
const notFound = ref(false)
const loadError = ref<string | null>(null)

try {
  status.value = await api<StaleStatus>(capabilities.route('pagesStaleStatus'))
} catch (e) {
  if (apiErrorCode(e) === 'NOT_FOUND') notFound.value = true
  else loadError.value = apiErrorMessage(e)
}
</script>

<template>
  <p v-if="loadError" class="dash__alert" role="alert">
    <KestrelUiIcon name="triangle-alert" :size="18" />
    <span>{{ t('delivery.staleLoadError') }} {{ loadError }}</span>
  </p>
  <NuxtLink v-else-if="!notFound && status && status.failed > 0" to="/admin/system?tab=delivery" class="dash__alert">
    <KestrelUiIcon name="triangle-alert" :size="18" />
    <span>{{ t('dash.deliveryStaleFailed', { n: status.failed }) }}</span>
  </NuxtLink>
</template>
