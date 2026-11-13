<script setup lang="ts">
import type { EventDeliveryStatus } from '#kestrel-admin/types/api'

const { t } = useT()
const api = useAdminApi()
const capabilities = useCapabilities()

const status = ref<EventDeliveryStatus | null>(null)
const notFound = ref(false)
const loadError = ref<string | null>(null)

try {
  status.value = await api<EventDeliveryStatus>(capabilities.route('eventsDeliveryStatus'))
} catch (e) {
  if (apiErrorCode(e) === 'NOT_FOUND') notFound.value = true
  else loadError.value = apiErrorText(t, e, t('events.dashLoadError'))
}
</script>

<template>
  <p v-if="loadError" class="dash__alert" role="alert">
    <KestrelUiIcon name="triangle-alert" :size="18" />
    <span>{{ loadError }}</span>
  </p>
  <NuxtLink v-else-if="!notFound && status && status.dead > 0" to="/admin/system?tab=events" class="dash__alert">
    <KestrelUiIcon name="triangle-alert" :size="18" />
    <span>{{ t(status.scope === 'store' ? 'events.dashDead' : 'events.dashFailedInline', { n: status.dead }) }}</span>
  </NuxtLink>
</template>
