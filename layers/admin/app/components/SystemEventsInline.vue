<script setup lang="ts">
import type { EventDeliveryStatus } from '#kestrel-admin/types/api'
import { humanizeRelativeTime } from '#kestrel-admin/utils/humanize'

const { t, lang } = useT()
const api = useAdminApi()
const capabilities = useCapabilities()

const status = ref<EventDeliveryStatus | null>(null)
const notFound = ref(false)
const loadError = ref<string | null>(null)

let inFlight = false

async function load() {
  if (inFlight) return
  inFlight = true
  try {
    status.value = await api<EventDeliveryStatus>(capabilities.route('eventsDeliveryStatus'))
    notFound.value = false
    loadError.value = null
  } catch (e) {
    if (apiErrorCode(e) === 'NOT_FOUND') {
      notFound.value = true
      loadError.value = null
    } else {
      notFound.value = false
      loadError.value = apiErrorText(t, e)
    }
  } finally {
    inFlight = false
  }
}
await load()

const POLL_MS = 5000
let pollId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  pollId = setInterval(() => { void load() }, POLL_MS)
})
onUnmounted(() => {
  if (pollId === null) return
  clearInterval(pollId)
  pollId = null
})

const canSeeInsights = computed(() => capabilities.has('insightsManifest'))

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function absolute(ms: number | null): string { return ms === null ? '—' : dateFmt.format(new Date(ms)) }
function relative(ms: number | null): string { return ms === null ? '—' : humanizeRelativeTime(ms, lang.value) }
</script>

<template>
  <section class="events-inline">
    <KestrelUiAlert v-if="notFound" variant="info">{{ t('events.deliveryNotAvailable') }}</KestrelUiAlert>
    <KestrelUiAlert v-else-if="loadError" variant="error">{{ loadError }}</KestrelUiAlert>

    <template v-else-if="status">
      <KestrelUiAlert variant="info">{{ t('events.inlineNote') }}</KestrelUiAlert>

      <dl class="events-inline__facts">
        <dt>{{ t('events.failedInline') }}</dt>
        <dd>{{ status.dead }}</dd>
        <dt>{{ t('events.since') }}</dt>
        <dd :title="absolute(status.since)">{{ relative(status.since) }}</dd>
        <dt>{{ t('events.lastFailure') }}</dt>
        <dd :title="absolute(status.lastDeadAt)">{{ relative(status.lastDeadAt) }}</dd>
      </dl>

      <p class="events-inline__hint">
        <NuxtLink v-if="canSeeInsights" to="/admin/insights?tab=live">{{ t('events.seeInsights') }}</NuxtLink>
        <template v-else>{{ t('events.seeInsights') }}</template>
      </p>

      <div class="events-inline__bar">
        <KestrelUiButton type="button" variant="ghost" size="sm" icon="rotate-cw" @click="load">
          {{ t('events.refresh') }}
        </KestrelUiButton>
      </div>
    </template>
  </section>
</template>

<style lang="scss">
.events-inline {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;

    dt {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
    dd {
      margin: 0;
      font-weight: var(--weight-medium);
    }
  }

  &__hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
}
</style>
