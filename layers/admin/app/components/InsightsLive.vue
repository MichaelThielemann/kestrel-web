<script setup lang="ts">
import type { InsightsManifest } from '#kestrel-admin/types/api'
import { formatMs, formatUptime } from '#kestrel-admin/utils/insights-format'

defineProps<{ manifest: InsightsManifest }>()
const { t, lang } = useT()
const { stats, statsError, loadStats } = useInsights()

const inFlight = ref(false)
const lastUpdatedAt = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  if (inFlight.value) return
  inFlight.value = true
  try {
    const s = await loadStats()
    if (s) lastUpdatedAt.value = Date.now()
  } finally {
    inFlight.value = false
  }
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => { void refresh() }, 5000)
})
onUnmounted(() => {
  if (timer !== null) clearInterval(timer)
  timer = null
})

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function absolute(ms: number | null): string { return ms === null ? '—' : dateFmt.format(new Date(ms)) }
function relative(ms: number | null): string { return ms === null ? '—' : humanizeRelativeTime(ms, lang.value) }
</script>

<template>
  <section class="insights-live">
    <KestrelUiAlert variant="info">{{ t('insights.perProcess') }}</KestrelUiAlert>
    <KestrelUiAlert v-if="statsError" variant="error">{{ statsError }}</KestrelUiAlert>

    <div class="insights-live__bar">
      <KestrelUiButton type="button" variant="secondary" size="sm" icon="rotate-cw" :loading="inFlight" @click="refresh">
        {{ t('insights.refresh') }}
      </KestrelUiButton>
      <span v-if="lastUpdatedAt" class="insights-live__updated" :title="absolute(lastUpdatedAt)">{{ t('insights.lastUpdated', { time: relative(lastUpdatedAt) }) }}</span>
    </div>

    <template v-if="stats">
      <div class="insights-live__stats">
        <div class="insights-live__stat">
          <span class="insights-live__stat-label">{{ t('insights.uptime') }}</span>
          <span class="insights-live__stat-value">{{ formatUptime(stats.process.uptimeMs, lang) }}</span>
        </div>
        <div class="insights-live__stat">
          <span class="insights-live__stat-label">{{ t('insights.pid') }}</span>
          <span class="insights-live__stat-value">{{ stats.process.pid }}</span>
        </div>
        <div class="insights-live__stat">
          <span class="insights-live__stat-label">{{ t('insights.activeRuns') }}</span>
          <span class="insights-live__stat-value">{{ stats.runs.active }}</span>
        </div>
        <div class="insights-live__stat">
          <span class="insights-live__stat-label">{{ t('insights.totalRuns') }}</span>
          <span class="insights-live__stat-value">{{ stats.runs.total }}</span>
        </div>
        <div class="insights-live__stat">
          <span class="insights-live__stat-label">{{ t('insights.failedRuns') }}</span>
          <span class="insights-live__stat-value">{{ stats.runs.failed }}</span>
        </div>
        <div class="insights-live__stat">
          <span class="insights-live__stat-label">{{ t('insights.errorRuns') }}</span>
          <span class="insights-live__stat-value">{{ stats.runs.errors }}</span>
        </div>
      </div>

      <div class="insights-live__section">
        <h2 class="insights-live__title">{{ t('insights.colPipelines') }}</h2>
        <div class="list__scroll">
          <KestrelUiTable>
            <template #head>
              <th scope="col">{{ t('insights.colPipeline') }}</th>
              <th scope="col">{{ t('insights.colRuns') }}</th>
              <th scope="col">{{ t('insights.colFailed') }}</th>
              <th scope="col">{{ t('insights.colErrors') }}</th>
              <th scope="col">{{ t('insights.colP50') }}</th>
              <th scope="col">{{ t('insights.colP95') }}</th>
              <th scope="col">{{ t('insights.colLastRun') }}</th>
            </template>
            <template #body>
              <tr v-for="p in stats.pipelines" :key="p.name">
                <td>{{ p.name }}</td>
                <td>{{ p.count }}</td>
                <td>{{ p.failed }}</td>
                <td>{{ p.errors }}</td>
                <td>{{ formatMs(p.p50Ms) }}</td>
                <td>{{ formatMs(p.p95Ms) }}</td>
                <td :title="absolute(p.lastAt)">{{ relative(p.lastAt) }}</td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </div>

      <div class="insights-live__section">
        <h2 class="insights-live__title">{{ t('insights.colSteps') }}</h2>
        <div class="list__scroll">
          <KestrelUiTable>
            <template #head>
              <th scope="col">{{ t('insights.colPipeline') }}</th>
              <th scope="col">{{ t('insights.colSteps') }}</th>
              <th scope="col">{{ t('insights.colRuns') }}</th>
              <th scope="col">{{ t('insights.colFailed') }}</th>
              <th scope="col">{{ t('insights.colErrors') }}</th>
              <th scope="col">{{ t('insights.colP50') }}</th>
              <th scope="col">{{ t('insights.colP95') }}</th>
            </template>
            <template #body>
              <tr v-for="s in stats.steps" :key="`${s.pipeline}:${s.step}`">
                <td>{{ s.pipeline }}</td>
                <td><code>{{ s.step }}</code></td>
                <td>{{ s.count }}</td>
                <td>{{ s.failed }}</td>
                <td>{{ s.errors }}</td>
                <td>{{ formatMs(s.p50Ms) }}</td>
                <td>{{ formatMs(s.p95Ms) }}</td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </div>

      <div class="insights-live__section">
        <h2 class="insights-live__title">{{ t('insights.eventsTitle') }}</h2>
        <div v-if="stats.events.length === 0" class="insights-live__empty">{{ t('insights.noEvents') }}</div>
        <div v-else class="list__scroll">
          <KestrelUiTable>
            <template #head>
              <th scope="col">{{ t('insights.colEvent') }}</th>
              <th scope="col">{{ t('insights.colCount') }}</th>
              <th scope="col">{{ t('insights.colLast') }}</th>
            </template>
            <template #body>
              <tr v-for="e in stats.events" :key="e.name">
                <td>{{ e.name }}</td>
                <td>{{ e.count }}</td>
                <td :title="absolute(e.lastAt)">{{ relative(e.lastAt) }}</td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </div>

      <div class="insights-live__section">
        <h2 class="insights-live__title">{{ t('insights.rateLimitTitle') }}</h2>
        <div v-if="stats.ratelimit.length === 0" class="insights-live__empty">{{ t('insights.noRateLimitBuckets') }}</div>
        <div v-else class="list__scroll">
          <KestrelUiTable>
            <template #head>
              <th scope="col">{{ t('insights.colKey') }}</th>
              <th scope="col">{{ t('insights.colRemaining') }}</th>
              <th scope="col">{{ t('insights.colResetAt') }}</th>
            </template>
            <template #body>
              <tr v-for="b in stats.ratelimit" :key="b.key">
                <td>{{ b.key }}</td>
                <td>{{ b.remaining }}</td>
                <td :title="absolute(b.resetAt)">{{ relative(b.resetAt) }}</td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </div>
    </template>
  </section>
</template>

<style lang="scss">
.insights-live {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
  min-height: 0;

  &__bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  &__updated {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  &__stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 6rem;
  }
  &__stat-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  &__stat-value {
    font-weight: var(--weight-medium);
  }

  &__title {
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    margin: 0 0 var(--space-2);
  }

  &__empty {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
}
</style>
