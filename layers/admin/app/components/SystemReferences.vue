<script setup lang="ts">
import type { BrokenReference, BrokenLink } from '#kestrel-admin/types/api'
import { linksRebuild, referencesRebuild } from '#kestrel-admin/actions/system'
import type { ActionDeps } from '#kestrel-admin/actions/types'

const { t } = useT()
const api = useApi()
const toast = useToast()
const { has } = useFeatures()
const hasReferences = has('references')
const hasLinks = has('links')

const deps: ActionDeps = { api, t, toast }

const refs = ref<BrokenReference[]>([])
const links = ref<BrokenLink[]>([])
const refsError = ref(false)
const linksError = ref(false)
const refsBusy = ref(false)
const linksBusy = ref(false)

async function loadRefs() {
  refsError.value = false
  try { refs.value = await api<BrokenReference[]>('/admin/references/broken') }
  catch { refsError.value = true }
}
async function loadLinks() {
  linksError.value = false
  try { links.value = (await api<BrokenLink[]>('/admin/links/broken')).filter((l) => l.ok === false) }
  catch { linksError.value = true }
}

await Promise.all([hasReferences ? loadRefs() : null, hasLinks ? loadLinks() : null])

function rebuildRefs() {
  return runAction(referencesRebuild, {
    deps,
    ops: { setBusy: (on) => { refsBusy.value = on }, busy: () => refsBusy.value },
    refresh: loadRefs,
  })
}
function rebuildLinks() {
  return runAction(linksRebuild, {
    deps,
    ops: { setBusy: (on) => { linksBusy.value = on }, busy: () => linksBusy.value },
    refresh: loadLinks,
  })
}

function fromLink(id: string, locale: string | null) {
  return `/admin/pages/${id}${locale ? `?locale=${locale}` : ''}`
}
</script>

<template>
  <section class="refs">
    <div class="refs__scroll">
      <section v-if="hasReferences" class="refs__section">
        <div class="refs__section-head">
          <h2 class="refs__section-title">{{ t('refs.title') }}</h2>
          <KestrelUiButton type="button" size="sm" variant="secondary" :loading="refsBusy" @click="rebuildRefs">{{ t('refs.rebuild') }}</KestrelUiButton>
        </div>
        <KestrelUiAlert v-if="refsError" variant="error">{{ t('refs.loadError') }}</KestrelUiAlert>
        <KestrelUiEmptyState v-else-if="!refs.length" icon="check" :title="t('refs.empty.title')" :description="t('refs.empty.desc')" />
        <KestrelUiTable v-else :sticky="false">
          <template #head>
            <th>{{ t('refs.colReferrer') }}</th>
            <th>{{ t('refs.colField') }}</th>
            <th>{{ t('refs.colTarget') }}</th>
          </template>
          <template #body>
            <tr v-for="(r, i) in refs" :key="i">
              <td><NuxtLink :to="fromLink(r.fromId, r.locale)" class="refs__link">{{ r.fromType }} #{{ r.fromId }}</NuxtLink></td>
              <td>{{ r.field }}</td>
              <td class="refs__target">{{ r.toTarget }}/{{ r.toId }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </section>

      <section v-if="hasLinks" class="refs__section">
        <div class="refs__section-head">
          <h2 class="refs__section-title">{{ t('references.links.title') }}</h2>
          <KestrelUiButton type="button" size="sm" variant="secondary" :loading="linksBusy" @click="rebuildLinks">{{ t('refs.rebuild') }}</KestrelUiButton>
        </div>
        <KestrelUiAlert v-if="linksError" variant="error">{{ t('references.links.loadError') }}</KestrelUiAlert>
        <KestrelUiEmptyState v-else-if="!links.length" icon="check" :title="t('references.links.empty.title')" :description="t('references.links.empty.desc')" />
        <KestrelUiTable v-else :sticky="false">
          <template #head>
            <th>{{ t('refs.colReferrer') }}</th>
            <th>{{ t('references.links.colUrl') }}</th>
            <th>{{ t('references.links.colStatus') }}</th>
          </template>
          <template #body>
            <tr v-for="(l, i) in links" :key="i">
              <td><NuxtLink :to="fromLink(l.fromId, l.locale)" class="refs__link">{{ l.fromType }} #{{ l.fromId }}</NuxtLink></td>
              <td class="refs__target">{{ l.url }}</td>
              <td>{{ l.status ?? l.error ?? '—' }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </section>
    </div>
  </section>
</template>

<style lang="scss">
.refs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  overflow: hidden;
  flex: 1 1 auto;

  &__scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  &__section-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
  &__link {
    color: var(--color-primary);
    text-decoration: none;
    text-transform: capitalize;
  }
  &__target {
    color: var(--color-text-muted);
  }
}
</style>
