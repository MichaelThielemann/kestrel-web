<script setup lang="ts">
import { pipelinesUsingModule, stepsOfModule, triggersOf } from '#kestrel-admin/utils/insights-format'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
const { t } = useT()
const { manifest, moduleByName, availability, error, loadManifest } = useInsights()

await loadManifest()

const name = computed(() => [route.params.name].flat().join('/'))
const module = computed(() => moduleByName.value.get(name.value) ?? null)
const steps = computed(() => (manifest.value ? stepsOfModule(manifest.value, name.value) : []))
const pipelines = computed(() => (manifest.value ? pipelinesUsingModule(manifest.value, name.value) : []))
</script>

<template>
  <section class="insights-module">
    <NuxtLink to="/admin/insights" class="insights-module__back">
      <KestrelUiIcon name="arrow-left" size="1rem" />
      {{ t('insights.back') }}
    </NuxtLink>

    <KestrelUiAlert v-if="availability === 'notFound'" variant="info">{{ t('insights.notAvailable') }}</KestrelUiAlert>
    <KestrelUiAlert v-else-if="availability === 'forbidden'" variant="warning">{{ t('insights.forbidden') }}</KestrelUiAlert>
    <KestrelUiAlert v-else-if="availability === 'error'" variant="error">{{ error }}</KestrelUiAlert>

    <KestrelUiEmptyState
      v-else-if="!module"
      icon="search"
      :title="t('insights.moduleNotFoundTitle')"
      :description="t('insights.moduleNotFoundDescription', { name })"
    />

    <template v-else>
      <header class="insights-module__head">
        <h1 class="insights-module__title">{{ module.name }}</h1>
        <p class="insights-module__meta">
          {{ module.use }} · {{ module.version ? t('insights.moduleVersion') + ' ' + module.version : t('insights.moduleNoVersion') }}
          · {{ t('insights.moduleCoreVersion') }} {{ manifest?.core.version }}
        </p>
        <div v-if="module.provides.length" class="insights-module__chip-group">
          <span class="insights-module__chip-group-label">{{ t('insights.colProvides') }}</span>
          <span v-for="c in module.provides" :key="c" class="insights-chip insights-chip--provides" :title="c">{{ c }}</span>
        </div>
        <div v-if="module.requires.length" class="insights-module__chip-group">
          <span class="insights-module__chip-group-label">{{ t('insights.colRequires') }}</span>
          <span v-for="c in module.requires" :key="c" class="insights-chip insights-chip--requires" :title="c">{{ c }}</span>
        </div>
        <div v-if="module.optional.length" class="insights-module__chip-group">
          <span class="insights-module__chip-group-label">{{ t('insights.colOptional') }}</span>
          <span v-for="c in module.optional" :key="c" class="insights-chip insights-chip--optional" :title="`${c} ${t('insights.optionalSuffix')}`">{{ c }}</span>
        </div>
        <span v-if="module.eventHook" class="insights-badge insights-badge--info">{{ t('insights.eventHookBadge') }}</span>
      </header>

      <KestrelInsightsConfigVariables :variables="module.config.variables" />

      <section class="insights-module__section">
        <h2 class="insights-module__section-title">{{ t('insights.stepsTitle') }}</h2>
        <KestrelInsightsStepList :steps="steps" />
      </section>

      <section class="insights-module__section">
        <h2 class="insights-module__section-title">{{ t('insights.pipelinesUsingModule') }}</h2>
        <p v-if="pipelines.length === 0" class="insights-module__muted">{{ t('insights.noPipelines') }}</p>
        <div v-else class="list__scroll">
          <KestrelUiTable class="insights-table">
            <template #head>
              <th scope="col">{{ t('insights.colPipeline') }}</th>
              <th scope="col">{{ t('insights.colSteps') }}</th>
              <th scope="col">{{ t('insights.colTriggers') }}</th>
            </template>
            <template #body>
              <tr v-for="p in pipelines" :key="p.name">
                <td>{{ p.name }}</td>
                <td class="insights-chip-cell">
                  <div class="insights-chips">
                    <span
                      v-for="s in p.steps"
                      :key="s.spec"
                      class="insights-chip"
                      :class="{ 'insights-chip--highlight': s.module === module.name }"
                      :title="s.module"
                    >{{ s.spec }}</span>
                  </div>
                </td>
                <td class="insights-chip-cell">
                  <div class="insights-chips">
                    <span v-for="tr in triggersOf(manifest!, p.name)" :key="`${tr.kind}:${tr.label}`" class="insights-chip" :title="tr.label">{{ tr.label }}</span>
                  </div>
                </td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </section>
    </template>
  </section>
</template>

<style lang="scss">
.insights-module {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow-y: auto;
  min-height: 0;

  &__back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    color: var(--color-text-muted);
    font-size: var(--text-sm);

    &:hover {
      color: var(--color-text);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
  }

  &__head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }

  &__meta {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__chip-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }

  &__chip-group-label {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    margin-inline-end: var(--space-1);
  }

  &__section-title {
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    margin: 0 0 var(--space-2);
  }

  &__muted {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
}

.insights-chip--highlight {
  border-color: var(--color-primary);
  color: var(--color-primary-text);
}
</style>
