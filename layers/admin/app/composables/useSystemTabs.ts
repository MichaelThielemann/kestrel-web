import { computed } from 'vue'

export const SYSTEM_FEATURE_TAB_IDS = ['users', 'references', 'delivery', 'paths', 'replication', 'migrations', 'events', 'images'] as const
export type SystemFeatureTabId = typeof SYSTEM_FEATURE_TAB_IDS[number]

export function isSystemFeatureTab(id: string): id is SystemFeatureTabId {
  return (SYSTEM_FEATURE_TAB_IDS as readonly string[]).includes(id)
}

export function useSystemTabs() {
  const capabilities = useCapabilities()
  const { collections } = useCollections()

  const hasReferences = computed(() => capabilities.has('brokenReferences') || capabilities.has('brokenLinks'))
  const canDeliver = computed(() => capabilities.has('publishAllPages'))
  const canReplication = computed(() => capabilities.has('replicationStatus'))
  const canMigrations = computed(() => capabilities.has('listMigrations'))
  const canEvents = computed(() => capabilities.has('eventsDeliveryStatus'))
  const canEventsQueue = computed(() => capabilities.has('eventsQueueStatus'))
  const canImages = computed(() => capabilities.has('imagesStatus'))
  const canPaths = computed(() => capabilities.has('rebuildPaths'))

  const systemCollections = computed(() => collections.value.filter((entry) => entry.mode === 'single' && entry.placement === 'system'))
  const collectionTabIds = computed(() => {
    const names = systemCollections.value.map((entry) => entry.name)
    const rest = names.filter((name) => name !== 'settings')
    return names.includes('settings') ? ['settings', ...rest] : rest
  })

  function collectionVisible(name: string): boolean {
    return capabilities.hasVerb(name, 'get')
  }

  const tabIds = computed(() => [...collectionTabIds.value, ...SYSTEM_FEATURE_TAB_IDS])

  const visibleTabs = computed<string[]>(() => tabIds.value.filter((id) => {
    if (id === 'users') return capabilities.has('listUsers')
    if (id === 'references') return hasReferences.value
    if (id === 'delivery') return canDeliver.value
    if (id === 'paths') return canPaths.value
    if (id === 'replication') return canReplication.value
    if (id === 'migrations') return canMigrations.value
    if (id === 'events') return canEvents.value
    if (id === 'images') return canImages.value
    return collectionVisible(id)
  }))

  const hasAccess = computed(() => visibleTabs.value.length > 0)

  return {
    tabIds,
    visibleTabs,
    hasAccess,
    systemCollections,
    collectionVisible,
    hasReferences,
    canDeliver,
    canReplication,
    canMigrations,
    canEvents,
    canEventsQueue,
    canImages,
    canPaths,
  }
}
