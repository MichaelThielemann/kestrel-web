<script setup lang="ts">
import { resolveLocalized } from '#kestrel-admin/utils/localized'
import type { ListPage, BrokenReference, BrokenLink, User } from '#kestrel-admin/types/api'

definePageMeta({ layout: 'admin', middleware: 'admin-auth' })

interface DashCard { name: string; icon: string; label: string; mode: 'multi' | 'single'; placement: 'rail' | 'system' | 'account'; count: number | null; countError: string | null }

const { t, lang } = useT()
const { isAdmin } = useAuth()
const { has } = useFeatures()
const { collections } = useCollections()
const api = useApi()

const cards = ref<DashCard[]>(
  collections.value
    .filter((c) => c.nav !== false && c.placement !== 'account')
    .map((c) => ({
      name: c.name,
      icon: c.icon ?? 'file-text',
      label: resolveLocalized(c.label?.plural, lang.value) ?? c.name,
      mode: c.mode,
      placement: c.placement,
      count: null,
      countError: null,
    })),
)
const mediaCount = ref<number | null>(null)
const mediaCountError = ref<string | null>(null)
const usersCount = ref<number | null>(null)
const usersCountError = ref<string | null>(null)
const brokenCount = ref(0)
const brokenError = ref<string | null>(null)

async function loadCounts() {
  await Promise.all([
    ...cards.value
      .filter((c) => c.mode === 'multi')
      .map(async (c) => {
        try {
          c.count = (await api<ListPage<unknown>>(`/admin/${c.name}`, { query: { limit: 1 } })).total
          c.countError = null
        } catch (e) {
          c.count = null
          c.countError = apiErrorMessage(e)
        }
      }),
    (async () => {
      try {
        mediaCount.value = (await api<ListPage<unknown>>('/media', { query: { limit: 1 } })).total
        mediaCountError.value = null
      } catch (e) {
        mediaCount.value = null
        mediaCountError.value = apiErrorMessage(e)
      }
    })(),
    isAdmin.value
      ? (async () => {
          try {
            usersCount.value = (await api<User[]>('/users')).length
            usersCountError.value = null
          } catch (e) {
            usersCount.value = null
            usersCountError.value = apiErrorMessage(e)
          }
        })()
      : Promise.resolve(),
  ])
}

async function loadBroken() {
  try {
    const [refs, links] = await Promise.all([
      has('references') ? api<BrokenReference[]>('/admin/references/broken') : [],
      has('links') ? api<BrokenLink[]>('/admin/links/broken') : [],
    ])
    brokenCount.value = refs.length + links.filter((l) => l.ok === false).length
    brokenError.value = null
  } catch (e) {
    brokenCount.value = 0
    brokenError.value = apiErrorMessage(e)
  }
}

await Promise.all([loadCounts(), loadBroken()])
</script>

<template>
  <section class="dash">
    <h1 class="dash__title">{{ t('dash.title') }}</h1>
    <p class="dash__lede">{{ t('dash.lede') }}</p>
    <p v-if="brokenError" class="dash__alert" role="alert">
      <KestrelUiIcon name="triangle-alert" :size="18" />
      <span>{{ t('refs.loadError') }} {{ brokenError }}</span>
    </p>
    <NuxtLink v-else-if="brokenCount" to="/admin/system?tab=references" class="dash__alert">
      <KestrelUiIcon name="triangle-alert" :size="18" />
      <span>{{ t('refs.dashAlert', { n: brokenCount }) }}</span>
    </NuxtLink>
    <ul class="dash__grid">
      <li v-for="c in cards" :key="c.name">
        <NuxtLink :to="c.placement === 'system' ? `/admin/system?tab=${c.name}` : `/admin/${c.name}`" class="dash__card">
          <KestrelUiIcon :name="c.icon" class="dash__icon" size="1.5rem" />
          <span class="dash__name">{{ c.label }}</span>
          <span class="dash__mode">{{ c.mode === 'single' ? t('dash.mode.singleton') : (c.count ?? '—') }}</span>
          <span v-if="c.countError" class="dash__tile-error" role="alert">{{ c.countError }}</span>
        </NuxtLink>
      </li>
      <li>
        <NuxtLink to="/admin/media" class="dash__card">
          <KestrelUiIcon name="image" class="dash__icon" size="1.5rem" />
          <span class="dash__name">{{ t('media.title') }}</span>
          <span class="dash__mode">{{ mediaCount ?? '—' }}</span>
          <span v-if="mediaCountError" class="dash__tile-error" role="alert">{{ mediaCountError }}</span>
        </NuxtLink>
      </li>
      <li v-if="isAdmin">
        <NuxtLink to="/admin/system?tab=users" class="dash__card">
          <KestrelUiIcon name="users" class="dash__icon" size="1.5rem" />
          <span class="dash__name">{{ t('users.title') }}</span>
          <span class="dash__mode">{{ usersCount ?? '—' }}</span>
          <span v-if="usersCountError" class="dash__tile-error" role="alert">{{ usersCountError }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style lang="scss">
.dash {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;

  &__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }
  &__lede {
    color: var(--color-text-muted);
    font-size: var(--text-base);
  }

  &__alert {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-md);
    color: var(--color-warning-text);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  &__grid {
    list-style: none;
    margin: var(--space-3) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--space-4);
  }
  &__card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    text-decoration: none;
    color: var(--color-text);
    transition: border-color var(--motion-fast) var(--ease-standard);

    &:hover {
      border-color: var(--color-border-strong);
    }
    &:focus-visible {
      border-color: var(--color-primary);
    }
  }
  &__icon {
    color: var(--color-primary);
  }
  &__name {
    font-weight: var(--weight-medium);
    text-transform: capitalize;
  }
  &__mode {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  &__tile-error {
    font-size: var(--text-xs);
    color: var(--color-danger);
  }
}
</style>
