<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InsightsConfigVariable, InsightsManifest } from '#kestrel-admin/types/api'
import { configVariableMatches, moduleRoute, sortedModules } from '#kestrel-admin/utils/insights-format'

interface ConfigGroup {
  name: string
  slug: string
  variables: InsightsConfigVariable[]
}

const props = defineProps<{ manifest: InsightsManifest }>()
const { t } = useT()

const filter = ref('')
const showModulesWithoutConfig = ref(false)

function slugOf(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-')
}

const modules = computed(() => sortedModules(props.manifest))

const configured = computed(() => modules.value.filter((m) => m.config.variables.length > 0))

const modulesWithoutConfig = computed(() => modules.value.filter((m) => m.config.variables.length === 0))

const groups = computed<ConfigGroup[]>(() => configured.value
  .map((m) => ({ name: m.name, slug: slugOf(m.name), variables: m.config.variables.filter((v) => configVariableMatches(v, m.name, filter.value)) }))
  .filter((g) => g.variables.length > 0))

const total = computed(() => configured.value.reduce((sum, m) => sum + m.config.variables.length, 0))

const shown = computed(() => groups.value.reduce((sum, g) => sum + g.variables.length, 0))
</script>

<template>
  <section class="insights-config-tab">
    <div class="insights-config-tab__bar">
      <KestrelUiTextInput v-model="filter" class="insights-config-tab__filter" :placeholder="t('insights.configFilterPlaceholder')" icon="search" slim />
      <p class="insights-config-tab__count">{{ t('insights.configCount', { shown, total }) }}</p>
    </div>

    <div class="u-scroll insights-config-tab__body">
      <section v-for="g in groups" :key="g.name" class="insights-config-tab__group">
        <h2 :id="`insights-config-${g.slug}`" class="insights-config-tab__module">
          <NuxtLink :to="moduleRoute(g.name)">{{ g.name }}</NuxtLink>
        </h2>
        <KestrelInsightsConfigVariables :variables="g.variables" :labelled-by="`insights-config-${g.slug}`" :scroll="false" />
      </section>

      <KestrelUiEmptyState v-if="groups.length === 0" icon="sliders" :title="t('insights.noConfigVariables')" :description="t('insights.noConfigVariablesHint')" />

      <div v-if="modulesWithoutConfig.length > 0" class="insights-config-tab__rest">
        <KestrelUiButton
          variant="secondary"
          size="sm"
          :icon="showModulesWithoutConfig ? 'chevron-up' : 'chevron-down'"
          :aria-expanded="showModulesWithoutConfig"
          aria-controls="insights-config-without"
          @click="showModulesWithoutConfig = !showModulesWithoutConfig"
        >
          {{ t('insights.modulesWithoutConfig', { count: modulesWithoutConfig.length }) }}
        </KestrelUiButton>
        <div v-show="showModulesWithoutConfig" id="insights-config-without" class="insights-chips insights-config-tab__rest-list">
          <NuxtLink v-for="m in modulesWithoutConfig" :key="m.name" class="insights-chip" :to="moduleRoute(m.name)">{{ m.name }}</NuxtLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style lang="scss">
.insights-config-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;

  &__bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }

  &__filter {
    max-width: 20rem;
  }

  &__count {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  &__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__module {
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
  }

  &__rest {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }

  &__rest-list {
    padding-block-end: var(--space-2);
  }
}
</style>
