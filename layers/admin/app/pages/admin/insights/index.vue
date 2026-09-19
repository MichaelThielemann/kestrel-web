<script setup lang="ts">
import { INSIGHTS_TABS, insightsTabFromQuery, isInsightsTab, type InsightsTabId } from '#kestrel-admin/utils/insights-tabs'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
const router = useRouter()
const { t } = useT()
const { manifest, availability, error, loadManifest } = useInsights()

await loadManifest()

const activeTab = computed<InsightsTabId>(() => insightsTabFromQuery(route.query.tab))

function setTab(tab: InsightsTabId) {
  return router.replace({ query: { ...route.query, tab } })
}

const tabItems = computed(() => INSIGHTS_TABS.map((id) => ({ id, label: t(`insights.tabs.${id}`) })))

function onTabSelect(id: string) {
  if (isInsightsTab(id)) void setTab(id)
}
</script>

<template>
  <section class="insights">
    <header class="insights__head">
      <h1 class="insights__title">{{ t('insights.title') }}</h1>
      <p v-if="manifest" class="insights__meta">{{ t('insights.coreVersion', { version: manifest.core.version }) }} · {{ t('insights.moduleCount', { count: manifest.modules.length }) }} · {{ t('insights.pipelineCount', { count: manifest.pipelines.length }) }}</p>
    </header>

    <KestrelUiAlert v-if="availability === 'notFound'" variant="info">{{ t('insights.notAvailable') }}</KestrelUiAlert>
    <KestrelUiAlert v-else-if="availability === 'forbidden'" variant="warning">{{ t('insights.forbidden') }}</KestrelUiAlert>
    <KestrelUiAlert v-else-if="availability === 'error'" variant="error">{{ error }}</KestrelUiAlert>

    <div v-else-if="manifest" class="insights__tabs">
      <KestrelUiTabList
        class="insights__tablist"
        :tabs="tabItems"
        :model-value="activeTab"
        id-prefix="insights"
        :label="t('insights.tabsLabel')"
        @update:model-value="onTabSelect"
      />

      <div v-for="tab in INSIGHTS_TABS" :id="`insights-panel-${tab}`" :key="tab" role="tabpanel" class="insights__panel" :aria-labelledby="`insights-tab-${tab}`" :hidden="tab !== activeTab">
        <template v-if="tab === activeTab">
          <KestrelInsightsConfig v-if="tab === 'config'" :manifest="manifest" />
          <KestrelInsightsModules v-else-if="tab === 'modules'" :manifest="manifest" />
          <KestrelInsightsPipelines v-else-if="tab === 'pipelines'" :manifest="manifest" />
          <KestrelInsightsTriggers v-else-if="tab === 'triggers'" :manifest="manifest" />
          <KestrelInsightsLive v-else-if="tab === 'live'" :manifest="manifest" />
          <KestrelInsightsGraph v-else-if="tab === 'graph'" :manifest="manifest" />
        </template>
      </div>
    </div>
  </section>
</template>

<style lang="scss">
.insights {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  overflow: hidden;

  &__head {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
  }

  &__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }

  &__meta {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__tabs {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__tablist {
    flex: 0 0 auto;
  }

  &__panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    &[hidden] {
      display: none;
    }

    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
  }

}
</style>
