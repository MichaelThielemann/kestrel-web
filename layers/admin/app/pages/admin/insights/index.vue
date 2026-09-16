<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const TAB_IDS = ['modules', 'pipelines', 'triggers', 'live', 'graph'] as const
type TabId = typeof TAB_IDS[number]

const route = useRoute()
const router = useRouter()
const { t } = useT()
const { manifest, availability, error, loadManifest } = useInsights()

await loadManifest()

const activeTab = computed<TabId>(() => {
  const raw = typeof route.query.tab === 'string' ? route.query.tab : ''
  return (TAB_IDS as readonly string[]).includes(raw) ? raw as TabId : 'modules'
})

function setTab(tab: TabId) {
  return router.replace({ query: { ...route.query, tab } })
}

function onTabKey(e: KeyboardEvent) {
  const i = TAB_IDS.indexOf(activeTab.value)
  const next = e.key === 'ArrowRight' ? TAB_IDS[(i + 1) % TAB_IDS.length] : e.key === 'ArrowLeft' ? TAB_IDS[(i - 1 + TAB_IDS.length) % TAB_IDS.length] : e.key === 'Home' ? TAB_IDS[0] : e.key === 'End' ? TAB_IDS[TAB_IDS.length - 1] : undefined
  if (!next) return
  e.preventDefault()
  void setTab(next).then(() => document.getElementById(`insights-tab-${next}`)?.focus())
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
      <div class="insights__tablist ui-btngroup" role="tablist" :aria-label="t('insights.tabsLabel')" @keydown="onTabKey">
        <button v-for="tab in TAB_IDS" :id="`insights-tab-${tab}`" :key="tab" type="button" role="tab" class="insights__tab ui-btngroup__item"
          :aria-selected="tab === activeTab" :aria-controls="`insights-panel-${tab}`" :tabindex="tab === activeTab ? 0 : -1"
          :data-state="tab === activeTab ? 'active' : 'inactive'" @click="setTab(tab)">{{ t(`insights.tabs.${tab}`) }}</button>
      </div>

      <div v-for="tab in TAB_IDS" :id="`insights-panel-${tab}`" :key="tab" role="tabpanel" class="insights__panel" :aria-labelledby="`insights-tab-${tab}`" :hidden="tab !== activeTab">
        <template v-if="tab === activeTab">
          <KestrelInsightsModules v-if="tab === 'modules'" :manifest="manifest" />
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

  &__tab[data-state='active'] {
    background: var(--color-active, var(--color-surface-2));
    color: var(--color-primary-on-fill, var(--color-primary));
    font-weight: var(--weight-medium);
  }
}
</style>
