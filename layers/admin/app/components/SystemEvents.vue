<script setup lang="ts">
import type { DeadEvent, EventsQueueStatus } from '#kestrel-admin/types/api'
import { humanizeRelativeTime } from '#kestrel-admin/utils/humanize'
import { eventsRetryAll, eventsRetryOne } from '#kestrel-admin/actions/system'
import type { ActionDeps } from '#kestrel-admin/actions/types'

const { t, lang } = useT()
const api = useApi()
const toast = useToast()

const deps: ActionDeps = { api, t, toast }

const status = ref<EventsQueueStatus | null>(null)
const dead = ref<DeadEvent[]>([])
const notFound = ref(false)
const loadError = ref<string | null>(null)
const retryAllBusy = ref(false)
const retryOneBusy = ref<string | null>(null)
const confirmRetryAll = ref(false)

let inFlight = false

async function load() {
  if (inFlight) return
  inFlight = true
  loadError.value = null
  notFound.value = false
  try {
    const [s, d] = await Promise.all([
      api<EventsQueueStatus>('/admin/events/status'),
      api<{ items: DeadEvent[] }>('/admin/events/dead', { query: { limit: 100 } }),
    ])
    status.value = s
    dead.value = d.items
  } catch (e) {
    if (apiErrorCode(e) === 'NOT_FOUND') notFound.value = true
    else loadError.value = apiErrorMessage(e)
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

async function retryAll() {
  const r = await runAction(eventsRetryAll, {
    deps,
    ops: { setBusy: (on) => { retryAllBusy.value = on }, busy: () => retryAllBusy.value },
    refresh: load,
    count: dead.value.length,
  })
  if (r.ok) confirmRetryAll.value = false
}

function retryOne(event: DeadEvent) {
  return runAction(eventsRetryOne, {
    deps,
    ops: { setBusy: (on) => { retryOneBusy.value = on ? event.id : null }, busy: () => retryOneBusy.value === event.id },
    refresh: load,
    id: event.id,
  })
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function absolute(ms: number | null): string { return ms === null ? '—' : dateFmt.format(new Date(ms)) }
function relative(ms: number | null): string { return ms === null ? '—' : humanizeRelativeTime(ms, lang.value) }
</script>

<template>
  <section class="events">
    <KestrelUiAlert v-if="notFound" variant="info">{{ t('events.notAvailable') }}</KestrelUiAlert>
    <KestrelUiAlert v-else-if="loadError" variant="error">{{ loadError }}</KestrelUiAlert>

    <template v-else-if="status">
      <KestrelUiAlert variant="info">{{ t('events.atLeastOnce') }}</KestrelUiAlert>

      <div class="events__status">
        <div class="events__stat">
          <span class="events__stat-label">{{ t('events.pending') }}</span>
          <span class="events__stat-value">{{ status.pending }}</span>
        </div>
        <div class="events__stat">
          <span class="events__stat-label">{{ t('events.running') }}</span>
          <span class="events__stat-value">{{ status.running }}</span>
        </div>
        <div class="events__stat">
          <span class="events__stat-label">{{ t('events.dead') }}</span>
          <span class="events__stat-value">{{ status.dead }}</span>
        </div>
        <div class="events__stat">
          <span class="events__stat-label">{{ t('events.done24h') }}</span>
          <span class="events__stat-value">{{ status.done24h }}</span>
        </div>
        <div class="events__stat">
          <span class="events__stat-label">{{ t('events.oldestPending') }}</span>
          <span class="events__stat-value" :title="absolute(status.oldestPendingAt)">{{ relative(status.oldestPendingAt) }}</span>
        </div>
        <div class="events__stat">
          <span class="events__stat-label">{{ t('events.worker') }}</span>
          <span class="events__stat-value">
            {{ status.worker.running ? t('events.workerRunning') : t('events.workerStopped') }}
            <span v-if="status.worker.lastTickAt !== null" :title="absolute(status.worker.lastTickAt)">
              ({{ t('events.lastTick', { at: relative(status.worker.lastTickAt) }) }})
            </span>
          </span>
        </div>
      </div>

      <div class="events__bar">
        <KestrelUiButton type="button" variant="secondary" size="sm" icon="rotate-cw" :disabled="dead.length === 0" :loading="retryAllBusy" @click="confirmRetryAll = true">
          {{ t('events.retryAll') }}
        </KestrelUiButton>
        <KestrelUiButton type="button" variant="ghost" size="sm" icon="rotate-cw" @click="load">
          {{ t('events.refresh') }}
        </KestrelUiButton>
      </div>

      <div class="list__scroll">
        <KestrelUiTable>
          <template #head>
            <th>{{ t('events.colEvent') }}</th>
            <th>{{ t('events.colAttempts') }}</th>
            <th>{{ t('events.colError') }}</th>
            <th>{{ t('events.colFailedAt') }}</th>
            <th>{{ t('events.colCreatedAt') }}</th>
            <th class="ui-table__col--actions"><span class="ui-table__vh">{{ t('a11y.rowActions') }}</span></th>
          </template>
          <template #body>
            <tr v-for="event in dead" :key="event.id">
              <td class="events__mono">{{ event.name }}</td>
              <td>{{ event.attempts }}</td>
              <td class="events__error" :title="event.error">{{ event.error }}</td>
              <td :title="absolute(event.availableAt)">{{ relative(event.availableAt) }}</td>
              <td :title="absolute(event.createdAt)">{{ relative(event.createdAt) }}</td>
              <td class="ui-table__col--actions">
                <div class="ui-table__actions">
                  <KestrelUiButton
                    variant="ghost"
                    size="sm"
                    icon="rotate-cw"
                    :loading="retryOneBusy === event.id"
                    :disabled="retryOneBusy !== null"
                    :aria-label="t('events.retryOne')"
                    @click="retryOne(event)"
                  />
                </div>
              </td>
            </tr>
            <tr v-if="dead.length === 0">
              <td colspan="6" class="events__empty">{{ t('events.noDead') }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </template>

    <KestrelUiDialog :open="confirmRetryAll" :title="t('events.retryAll')" @update:open="(v) => { if (!v) confirmRetryAll = false }">
      <p>{{ t('events.confirmRetryAll', { count: dead.length }) }}</p>
      <template #footer>
        <KestrelUiButton variant="ghost" :disabled="retryAllBusy" @click="confirmRetryAll = false">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton variant="danger" :loading="retryAllBusy" @click="retryAll">{{ t('events.retryAll') }}</KestrelUiButton>
      </template>
    </KestrelUiDialog>
  </section>
</template>

<style lang="scss">
.events {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  &__status {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    flex: 0 0 auto;
  }

  &__stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 8rem;
  }
  &__stat-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  &__stat-value {
    font-weight: var(--weight-medium);
  }

  &__bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__mono {
    font-family: var(--font-mono, monospace);
  }

  &__error {
    max-width: 24rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__empty {
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-4);
  }
}
</style>
