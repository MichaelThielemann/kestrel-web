<script setup lang="ts">
import { resolveLocalized } from '#kestrel-admin/utils/localized'
import { switchSystemTab } from '#kestrel-admin/actions/editor'
import type { NavigatePort } from '#kestrel-admin/actions/types'
import { toastUnexpected } from '#kestrel-admin/actions/steps/notify'
import { isSystemFeatureTab, useSystemTabs } from '../../composables/useSystemTabs'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const route = useRoute()
const router = useRouter()
const { t, lang } = useT()
const deps = useActionDeps()
const { tabIds: TAB_IDS, visibleTabs, hasAccess, systemCollections, canEventsQueue } = useSystemTabs()
const localeParam = computed(() => (typeof route.query.locale === 'string' ? route.query.locale.trim() || undefined : undefined))

function tabDef(name: string) {
  return systemCollections.value.find((c) => c.name === name) ?? null
}

function tabTitle(tab: string): string {
  if (isSystemFeatureTab(tab)) return t(`system.tabs.${tab}`)
  return resolveLocalized(tabDef(tab)?.label?.singular, lang.value) ?? tab
}

const activeTab = computed<string>(() => {
  const fallback = visibleTabs.value[0] ?? ''
  const raw = typeof route.query.tab === 'string' ? route.query.tab : ''
  const id = TAB_IDS.value.includes(raw) ? raw : fallback
  return visibleTabs.value.includes(id) ? id : fallback
})
let pendingTab: string | null = null

const tabItems = computed(() => visibleTabs.value.map((id) => ({ id, label: tabTitle(id) })))

const titleRef = ref<HTMLElement | null>(null)

watch(activeTab, (next, previous) => {
  if (previous === undefined || next === previous || visibleTabs.value.includes(previous)) return
  titleRef.value?.focus()
})

const navigate: NavigatePort = async (d) => (d.kind === 'path' ? navigateTo(d.to) : router.replace({ query: d.query }))

async function setTab(value: unknown) {
  const id = String(value)
  if (id === pendingTab) return
  pendingTab = id
  try {
    const result = await runAction(switchSystemTab, {
      t,
      confirm: confirmDiscard,
      navigate,
      tabs: TAB_IDS.value,
      activeTab: activeTab.value,
      tab: id,
      query: route.query,
    })
    toastUnexpected(deps, result)
  } finally {
    pendingTab = null
  }
}
</script>

<template>
  <section class="system">
    <h1 ref="titleRef" class="system__title" tabindex="-1">{{ t('system.title') }}</h1>

    <div v-if="hasAccess" class="system__tabs">
      <KestrelUiTabList
        class="system__tablist"
        :tabs="tabItems"
        :model-value="activeTab"
        id-prefix="system"
        :label="t('system.tabsLabel')"
        @update:model-value="setTab"
      />

      <div v-for="tab in visibleTabs" :id="`system-panel-${tab}`" :key="tab" role="tabpanel" class="system__panel" :aria-labelledby="`system-tab-${tab}`" :hidden="tab !== activeTab">
        <template v-if="tab === activeTab">
          <KestrelSystemUsers v-if="tab === 'users'" />
          <KestrelSystemReferences v-else-if="tab === 'references'" />
          <KestrelSystemDelivery v-else-if="tab === 'delivery'" />
          <KestrelSystemPaths v-else-if="tab === 'paths'" />
          <KestrelSystemReplication v-else-if="tab === 'replication'" />
          <KestrelSystemMigrations v-else-if="tab === 'migrations'" />
          <KestrelSystemEvents v-else-if="tab === 'events' && canEventsQueue" />
          <KestrelSystemEventsInline v-else-if="tab === 'events'" />
          <KestrelSystemImages v-else-if="tab === 'images'" />
          <KestrelSingletonEditor v-else-if="tabDef(tab)" :collection="tab" :title="tabTitle(tab)" :locale-param="tabDef(tab)?.translatable ? localeParam : undefined" />
        </template>
      </div>
    </div>
    <p v-else class="system__missing">{{ t('capability.unavailable') }}</p>
  </section>
</template>

<style lang="scss">

.system {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  overflow: hidden;

  &__title {
    flex: 0 0 auto;
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
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

  &__missing {
    color: var(--color-text-muted);
  }
}
</style>
