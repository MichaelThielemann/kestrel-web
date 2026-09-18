<script setup lang="ts">
import type { InsightsRecentFailure } from '#kestrel-admin/types/api'

defineProps<{ failures: readonly InsightsRecentFailure[] }>()

const { t, lang } = useT()

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function absolute(ms: number): string { return dateFmt.format(new Date(ms)) }
function relative(ms: number): string { return humanizeRelativeTime(ms, lang.value) }
</script>

<template>
  <div class="insights-live__section">
    <h2 class="insights-live__title">{{ t('insights.failuresTitle') }}</h2>
    <KestrelUiEmptyState v-if="failures.length === 0" icon="check" :title="t('insights.noFailures')" :description="t('insights.noFailuresHint')" />
    <div v-else class="list__scroll">
      <KestrelUiTable>
        <template #head>
          <th scope="col">{{ t('insights.colWhen') }}</th>
          <th scope="col">{{ t('insights.colPipeline') }}</th>
          <th scope="col">{{ t('insights.colTrigger') }}</th>
          <th scope="col" class="insights-num">{{ t('insights.colStatus') }}</th>
          <th scope="col">{{ t('insights.colCode') }}</th>
          <th scope="col">{{ t('insights.colStep') }}</th>
          <th scope="col">{{ t('insights.colMessage') }}</th>
          <th scope="col">{{ t('insights.colRunId') }}</th>
        </template>
        <template #body>
          <tr v-for="f in failures" :key="f.runId">
            <td class="insights-nowrap" :title="absolute(f.at)">{{ relative(f.at) }}</td>
            <td><span class="insights-chip" :title="f.pipeline">{{ f.pipeline }}</span></td>
            <td><span class="insights-chip" :title="`${f.trigger.kind} ${f.trigger.name}`">{{ f.trigger.name }}</span></td>
            <td class="insights-num">{{ f.status }}</td>
            <td class="insights-nowrap">{{ f.code ?? '—' }}</td>
            <td><span v-if="f.step" class="insights-chip" :title="f.step"><code>{{ f.step }}</code></span><template v-else>—</template></td>
            <td class="insights-failures__message">{{ f.message ?? '—' }}</td>
            <td><span class="insights-chip" :title="f.runId"><code>{{ f.runId }}</code></span></td>
          </tr>
        </template>
      </KestrelUiTable>
    </div>
  </div>
</template>

<style lang="scss">
.insights-failures__message {
  min-width: 16rem;
  overflow-wrap: anywhere;
}
</style>
