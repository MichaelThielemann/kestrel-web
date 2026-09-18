<script setup lang="ts">
import type { InsightsManifest } from '#kestrel-admin/types/api'

defineProps<{ manifest: InsightsManifest }>()
const { t } = useT()
</script>

<template>
  <section class="insights-triggers">
    <div class="insights-triggers__section">
      <h2 class="insights-triggers__title">{{ t('insights.httpTriggers') }}</h2>
      <div class="list__scroll">
        <KestrelUiTable>
          <template #head>
            <th scope="col">{{ t('insights.colMethod') }}</th>
            <th scope="col" class="insights-nowrap">{{ t('insights.colPath') }}</th>
            <th scope="col">{{ t('insights.colPipeline') }}</th>
          </template>
          <template #body>
            <tr v-for="tr in manifest.triggers.http" :key="`${tr.method}:${tr.path}`">
              <td><span class="insights-badge insights-badge--info">{{ tr.method }}</span></td>
              <td class="insights-nowrap"><code>{{ tr.path }}</code></td>
              <td>{{ tr.pipeline }}</td>
            </tr>
            <tr v-if="manifest.triggers.http.length === 0">
              <td colspan="3" class="insights-triggers__empty">{{ t('insights.noHttpTriggers') }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </div>

    <div class="insights-triggers__section">
      <h2 class="insights-triggers__title">{{ t('insights.eventTriggers') }}</h2>
      <div class="list__scroll">
        <KestrelUiTable>
          <template #head>
            <th scope="col">{{ t('insights.colEvent') }}</th>
            <th scope="col">{{ t('insights.colPipeline') }}</th>
          </template>
          <template #body>
            <tr v-for="tr in manifest.triggers.events" :key="`${tr.event}:${tr.pipeline}`">
              <td>{{ tr.event }}</td>
              <td>{{ tr.pipeline }}</td>
            </tr>
            <tr v-if="manifest.triggers.events.length === 0">
              <td colspan="2" class="insights-triggers__empty">{{ t('insights.noEventTriggers') }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </div>

    <div class="insights-triggers__section">
      <h2 class="insights-triggers__title">{{ t('insights.cronTriggers') }}</h2>
      <div class="list__scroll">
        <KestrelUiTable>
          <template #head>
            <th scope="col" class="insights-nowrap">{{ t('insights.colExpression') }}</th>
            <th scope="col">{{ t('insights.colPipeline') }}</th>
          </template>
          <template #body>
            <tr v-for="tr in manifest.triggers.crons" :key="`${tr.expression}:${tr.pipeline}`">
              <td class="insights-nowrap"><code>{{ tr.expression }}</code></td>
              <td>{{ tr.pipeline }}</td>
            </tr>
            <tr v-if="manifest.triggers.crons.length === 0">
              <td colspan="2" class="insights-triggers__empty">{{ t('insights.noCronTriggers') }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </div>
  </section>
</template>

<style lang="scss">
.insights-triggers {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  overflow-y: auto;
  min-height: 0;

  &__title {
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    margin: 0 0 var(--space-2);
  }

  &__empty {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--space-3);
  }
}
</style>
