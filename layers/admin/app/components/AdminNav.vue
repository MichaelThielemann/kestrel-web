<script setup lang="ts">
import { resolveLocalized } from '#kestrel-admin/utils/localized'

const { t, lang } = useT()
const { collections } = useCollections()
const { collapsed } = useRailCollapsed()
const route = useRoute()
const capabilities = useCapabilities()
</script>

<template>
  <nav class="admin-nav" :aria-label="t('nav.collections')">
    <NuxtLink
      v-for="c in collections.filter((c) => c.nav !== false && c.placement === 'rail' && capabilities.hasVerb(c.name, 'listAll'))"
      :key="c.name"
      :to="`/admin/${c.name}`"
      class="admin-nav__link rail__item"
      :class="{ 'router-link-active': isNavItemActive(route.path, `/admin/${c.name}`) }"
      :title="collapsed ? (resolveLocalized(c.label?.plural, lang) ?? c.name) : undefined"
    >
      <KestrelUiIcon :name="c.icon ?? 'file-text'" class="rail__icon" size="1.25rem" />
      <span class="rail__label">{{ resolveLocalized(c.label?.plural, lang) ?? c.name }}</span>
    </NuxtLink>

    <NuxtLink
      v-if="capabilities.has('listMedia')"
      to="/admin/media"
      class="admin-nav__link rail__item"
      :class="{ 'router-link-active': isNavItemActive(route.path, '/admin/media') }"
      :title="collapsed ? t('media.title') : undefined"
    >
      <KestrelUiIcon name="image" class="rail__icon" size="1.25rem" />
      <span class="rail__label">{{ t('media.title') }}</span>
    </NuxtLink>
  </nav>
</template>

<style lang="scss">
.admin-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  &__link {
    text-transform: capitalize;
  }
}
</style>
