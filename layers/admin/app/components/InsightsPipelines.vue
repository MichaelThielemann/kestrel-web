<script setup lang="ts">
import type { InsightsManifest, InsightsPipelineStep } from '#kestrel-admin/types/api'
import { formatMs, pipelineStatsByName, triggersOf } from '#kestrel-admin/utils/insights-format'
import { stepSegments } from '#kestrel-admin/utils/insights-graph'
import type { StepSegment } from '#kestrel-admin/utils/insights-graph'

const props = defineProps<{ manifest: InsightsManifest }>()
const { t } = useT()
const { stats, loadStats } = useInsights()

onMounted(() => { void loadStats() })

const filter = ref('')

const statsByName = computed(() => pipelineStatsByName(stats.value))

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return props.manifest.pipelines
  return props.manifest.pipelines.filter((p) => p.name.toLowerCase().includes(q))
})

function segmentsOf(steps: InsightsPipelineStep[]): StepSegment[] {
  return stepSegments(steps)
}
</script>

<template>
  <section class="insights-pipelines">
    <KestrelUiTextInput v-model="filter" class="insights-pipelines__filter" :placeholder="t('insights.filterPlaceholder')" icon="search" slim />

    <div class="u-scroll">
      <KestrelUiTable class="insights-table">
        <template #head>
          <th scope="col">{{ t('insights.colPipeline') }}</th>
          <th scope="col">{{ t('insights.colSteps') }}</th>
          <th scope="col">{{ t('insights.colTriggers') }}</th>
          <th scope="col" class="insights-num">{{ t('insights.colRuns') }}</th>
          <th scope="col" class="insights-num">{{ t('insights.colFailed') }}</th>
          <th scope="col" class="insights-num">{{ t('insights.colP95') }}</th>
        </template>
        <template #body>
          <tr v-for="p in filtered" :key="p.name">
            <td>{{ p.name }}</td>
            <td class="insights-chip-cell">
              <div class="insights-chips">
                <template v-for="segment in segmentsOf(p.steps)" :key="segment.kind === 'group' ? `group-${segment.steps[0]!.spec}` : segment.step.spec">
                  <span v-if="segment.kind === 'step'" class="insights-chip" :title="segment.step.module">{{ segment.step.spec }}</span>
                  <span v-else class="insights-chip-group" role="group" :aria-label="t('insights.pipelines.atomic')" :title="t('insights.pipelines.atomic')">
                    <span v-for="s in segment.steps" :key="s.spec" class="insights-chip" :title="s.module">{{ s.spec }}</span>
                  </span>
                </template>
              </div>
            </td>
            <td class="insights-chip-cell">
              <div class="insights-chips">
                <span v-for="tr in triggersOf(manifest, p.name)" :key="`${tr.kind}:${tr.label}`" class="insights-chip" :title="tr.label">{{ tr.label }}</span>
              </div>
            </td>
            <td class="insights-num">{{ statsByName.get(p.name)?.count ?? '—' }}</td>
            <td class="insights-num">{{ statsByName.get(p.name)?.failed ?? '—' }}</td>
            <td class="insights-num">{{ statsByName.has(p.name) ? formatMs(statsByName.get(p.name)!.p95Ms) : '—' }}</td>
          </tr>
        </template>
      </KestrelUiTable>
    </div>
  </section>
</template>

<style lang="scss">
.insights-pipelines {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;

  &__filter {
    max-width: 20rem;
  }
}
</style>
