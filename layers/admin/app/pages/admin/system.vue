<script setup lang="ts">
import { resolveLocalized } from '#kestrel/utils/localized'
import { switchSystemTab } from '#kestrel/actions/editor'
import type { NavigatePort } from '#kestrel/actions/types'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

const FEATURE_TAB_IDS = ['users', 'references', 'delivery', 'replication', 'migrations', 'images'] as const
type FeatureTabId = typeof FEATURE_TAB_IDS[number]

function isFeatureTab(id: string): id is FeatureTabId {
  return (FEATURE_TAB_IDS as readonly string[]).includes(id)
}

const route = useRoute()
const router = useRouter()
const { t, lang } = useT()
const { isAdmin, can } = useAuth()
const { has } = useFeatures()
const { collections } = useCollections()
const hasReferences = has('references') || has('links')
const canDeliver = computed(() => has('delivery') && can('pages.manage'))
const canRedirects = computed(() => has('redirects') && (isAdmin.value || can('redirects.write')))
const canReplication = computed(() => has('replication') && isAdmin.value)
const canMigrations = computed(() => has('migrations') && isAdmin.value)
const canImages = computed(() => has('images') && can('images.manage'))
const localeParam = computed(() => (typeof route.query.locale === 'string' ? route.query.locale.trim() || undefined : undefined))

const systemCollections = computed(() => collections.value.filter((c) => c.mode === 'single' && c.placement === 'system'))
const collectionTabIds = computed(() => {
  const names = systemCollections.value.map((c) => c.name)
  const rest = names.filter((name) => name !== 'settings')
  return names.includes('settings') ? ['settings', ...rest] : rest
})

function collectionVisible(name: string): boolean {
  if (name === 'redirects') return canRedirects.value
  return true
}

const TAB_IDS = computed(() => [...collectionTabIds.value, ...FEATURE_TAB_IDS])

function tabDef(name: string) {
  return systemCollections.value.find((c) => c.name === name) ?? null
}

function tabTitle(tab: string): string {
  if (isFeatureTab(tab)) return t(`system.tabs.${tab}`)
  return resolveLocalized(tabDef(tab)?.label?.singular, lang.value) ?? tab
}

const visibleTabs = computed<string[]>(() => TAB_IDS.value.filter((id) => {
  if (id === 'users') return isAdmin.value
  if (id === 'references') return hasReferences
  if (id === 'delivery') return canDeliver.value
  if (id === 'replication') return canReplication.value
  if (id === 'migrations') return canMigrations.value
  if (id === 'images') return canImages.value
  return collectionVisible(id)
}))

const activeTab = computed<string>(() => {
  const fallback = visibleTabs.value[0] ?? ''
  const raw = typeof route.query.tab === 'string' ? route.query.tab : ''
  const id = TAB_IDS.value.includes(raw) ? raw : fallback
  if (id === 'users' && !isAdmin.value) return fallback
  if (id === 'references' && !hasReferences) return fallback
  if (id === 'delivery' && !canDeliver.value) return fallback
  if (id === 'replication' && !canReplication.value) return fallback
  if (id === 'migrations' && !canMigrations.value) return fallback
  if (id === 'images' && !canImages.value) return fallback
  if (!isFeatureTab(id) && !collectionVisible(id)) return fallback
  return id
})
let pendingTab: string | null = null

function onTabKey(e: KeyboardEvent) {
  const tabs = visibleTabs.value
  const i = tabs.indexOf(activeTab.value)
  const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null
  if (!next) return
  e.preventDefault()
  void setTab(next).then(() => document.getElementById(`system-tab-${next}`)?.focus())
}

const navigate: NavigatePort = async (d) => (d.kind === 'path' ? navigateTo(d.to) : router.replace({ query: d.query }))

async function setTab(value: unknown) {
  const id = String(value)
  if (id === pendingTab) return
  pendingTab = id
  try {
    await runAction(switchSystemTab, {
      t,
      confirm: confirmDiscard,
      navigate,
      tabs: TAB_IDS.value,
      activeTab: activeTab.value,
      tab: id,
      query: route.query,
    })
  } finally {
    pendingTab = null
  }
}
</script>

<template>
  <section class="system">
    <h1 class="system__title">{{ t('system.title') }}</h1>

    <div v-if="visibleTabs.length" class="system__tabs">
      <div class="system__tablist ui-btngroup" role="tablist" :aria-label="t('system.tabsLabel')" @keydown="onTabKey">
        <button v-for="tab in visibleTabs" :id="`system-tab-${tab}`" :key="tab" type="button" role="tab" class="system__tab ui-btngroup__item"
          :aria-selected="tab === activeTab" :aria-controls="`system-panel-${tab}`" :tabindex="tab === activeTab ? 0 : -1"
          :data-state="tab === activeTab ? 'active' : 'inactive'" @click="setTab(tab)">{{ tabTitle(tab) }}</button>
      </div>

      <div v-for="tab in visibleTabs" :id="`system-panel-${tab}`" :key="tab" role="tabpanel" class="system__panel" :aria-labelledby="`system-tab-${tab}`" :hidden="tab !== activeTab">
        <template v-if="tab === activeTab">
          <KestrelSystemUsers v-if="tab === 'users'" />
          <KestrelSystemReferences v-else-if="tab === 'references'" />
          <KestrelSystemDelivery v-else-if="tab === 'delivery'" />
          <KestrelSystemReplication v-else-if="tab === 'replication'" />
          <KestrelSystemMigrations v-else-if="tab === 'migrations'" />
          <KestrelSystemImages v-else-if="tab === 'images'" />
          <KestrelSingletonEditor v-else-if="tabDef(tab)" :collection="tab" :title="tabTitle(tab)" :locale-param="tabDef(tab)?.translatable ? localeParam : undefined" />
        </template>
      </div>
    </div>
    <p v-else class="system__empty">{{ t('system.empty') }}</p>
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

  &__tab[data-state='active'] {
    background: var(--color-active, var(--color-surface-2));
    color: var(--color-primary-on-fill, var(--color-primary));
    font-weight: var(--weight-medium);
  }

  &__empty {
    color: var(--color-text-muted);
  }
}
</style>
