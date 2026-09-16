<script setup lang="ts">
import type { InsightsManifest } from '#kestrel-admin/types/api'
import { moduleConfigSummary, moduleRoute, sortedModules } from '#kestrel-admin/utils/insights-format'

const props = defineProps<{ manifest: InsightsManifest }>()
const { t } = useT()

const filter = ref('')

const modules = computed(() => sortedModules(props.manifest))

const configSummaries = computed(() => new Map(modules.value.map((m) => [m.name, moduleConfigSummary(m)])))

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return modules.value
  return modules.value.filter((m) =>
    m.name.toLowerCase().includes(q)
    || m.use.toLowerCase().includes(q)
    || m.provides.some((c) => c.toLowerCase().includes(q))
    || m.requires.some((c) => c.toLowerCase().includes(q)))
})
</script>

<template>
  <section class="insights-modules">
    <KestrelUiTextInput v-model="filter" class="insights-modules__filter" :placeholder="t('insights.filterPlaceholder')" icon="search" slim />

    <div class="list__scroll">
      <KestrelUiTable>
        <template #head>
          <th scope="col">{{ t('insights.colModule') }}</th>
          <th scope="col">{{ t('insights.colVersion') }}</th>
          <th scope="col">{{ t('insights.colProvides') }}</th>
          <th scope="col">{{ t('insights.colRequires') }}</th>
          <th scope="col">{{ t('insights.colOptional') }}</th>
          <th scope="col">{{ t('insights.colSteps') }}</th>
          <th scope="col">{{ t('insights.colConfig') }}</th>
          <th scope="col">{{ t('insights.colEvent') }}</th>
        </template>
        <template #body>
          <tr v-for="m in filtered" :key="m.name">
            <td><NuxtLink :to="moduleRoute(m.name)">{{ m.name }}</NuxtLink></td>
            <td>{{ m.version ?? '—' }}</td>
            <td>
              <span v-for="c in m.provides" :key="c" class="insights-chip insights-chip--provides">{{ c }}</span>
            </td>
            <td>
              <span v-for="c in m.requires" :key="c" class="insights-chip insights-chip--requires">{{ c }}</span>
            </td>
            <td>
              <span v-for="c in m.optional" :key="c" class="insights-chip insights-chip--optional" :title="`${c} ${t('insights.optionalSuffix')}`">{{ c }}</span>
            </td>
            <td>{{ m.steps.length }}</td>
            <td>
              <span>{{ configSummaries.get(m.name)?.set }} / {{ configSummaries.get(m.name)?.total }}</span>
              <span v-if="configSummaries.get(m.name)?.missingRequired.length" class="insights-badge insights-badge--warning">
                {{ t('insights.configMissing', { names: configSummaries.get(m.name)?.missingRequired.join(', ') }) }}
              </span>
            </td>
            <td>
              <span v-if="m.eventHook" class="insights-badge insights-badge--info">{{ t('insights.eventHookBadge') }}</span>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="8" class="insights-modules__empty">{{ t('insights.noModules') }}</td>
          </tr>
        </template>
      </KestrelUiTable>
    </div>
  </section>
</template>

<style lang="scss">
.insights-modules {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;

  &__filter {
    max-width: 20rem;
  }

  &__empty {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--space-4);
  }
}
</style>
