<script setup lang="ts">

import '#kestrel/assets/scss/main.scss'
import { installAdminClient } from '../utils/admin-client'

installAdminClient()
const { authenticated } = useAuth()
const { collapsed, toggle: toggleRail } = useRailCollapsed()
const { theme } = useTheme()
const { t } = useT()
const route = useRoute()

useHead(() => ({
  title: 'Kestrel',
  titleTemplate: (title) => (title && title !== 'Kestrel' ? `${title} · Kestrel` : 'Kestrel'),
  htmlAttrs: { 'data-theme': theme.value, style: 'font-size: initial' },
}))
</script>

<template>
  <div class="admin" :class="{ 'admin--rail-collapsed': collapsed }">
    <aside v-if="authenticated" class="admin__rail">
      <div class="rail__head">
        <NuxtLink to="/admin" class="rail__brand" aria-label="Kestrel">
          <KestrelUiBrand />
          <span class="rail__brand-word rail__label">kestrel</span>
        </NuxtLink>
        <button
          type="button"
          class="rail__toggle"
          :aria-label="collapsed ? t('a11y.expandSidebar') : t('a11y.collapseSidebar')"
          @click="toggleRail"
        >
          <KestrelUiIcon :name="collapsed ? 'panel-left-open' : 'panel-left-close'" size="1.25rem" />
        </button>
      </div>

      <div class="rail__nav">
        <NuxtLink
          to="/admin"
          class="rail__item rail__item--dashboard"
          :title="collapsed ? t('nav.dashboard') : undefined"
        >
          <KestrelUiIcon name="home" class="rail__icon" size="1.25rem" />
          <span class="rail__label">{{ t('nav.dashboard') }}</span>
        </NuxtLink>

        <KestrelAdminNav />
      </div>

      <div class="rail__foot">
        <KestrelAdminAccount />
        <NuxtLink
          to="/admin/system"
          class="rail__item"
          :class="{ 'router-link-active': isNavItemActive(route.path, '/admin/system') }"
          :title="collapsed ? t('nav.system') : undefined"
        >
          <KestrelUiIcon name="settings" class="rail__icon" size="1.25rem" />
          <span class="rail__label">{{ t('nav.system') }}</span>
        </NuxtLink>
      </div>
    </aside>

    <main class="admin__main"><slot /></main>
    <KestrelUiToasts />
  </div>
</template>

<style lang="scss">
.admin {
  display: flex;
  align-items: flex-start;
  min-height: 100svh;
  background: var(--color-bg);

  --text-base: var(--text-sm);
  --space-2: 0.375rem;
  --space-3: 0.5rem;
  --space-4: 0.625rem;
  --space-5: 1rem;
  --control-height: calc((var(--space-2) * 2) + (var(--text-base) * var(--leading-normal)) + 2px);
  --control-icon-size: calc(var(--text-base) * var(--leading-normal));

  &__rail {
    position: sticky;
    top: 0;
    flex: 0 0 var(--rail-width);
    width: var(--rail-width);
    height: 100svh;
    display: flex;
    flex-direction: column;
    background: var(--color-rail-bg);
    border-right: 1px solid var(--color-border);
    transition:
      flex-basis var(--motion-base) var(--ease-standard),
      width var(--motion-base) var(--ease-standard);
  }

  &__main {
    flex: 1 1 auto;
    min-width: 0;
    height: 100svh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
  }

  &__main > * {
    flex: 1 1 auto;
    min-height: 0;
  }

  &--rail-collapsed &__rail {
    flex-basis: var(--rail-width-collapsed);
    width: var(--rail-width-collapsed);
  }
}

.rail {
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1);
  }

  &__brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    color: var(--color-text);
    text-decoration: none;
    font-weight: var(--weight-bold);
    border-radius: var(--radius-sm);

    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
  }

  &__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;

    &:hover {
      background: var(--color-hover);
      color: var(--color-text);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
  }

  &__nav {
    flex: 1 1 auto;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    text-decoration: none;
    cursor: pointer;

    &:hover {
      background: var(--color-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }

    &.router-link-active {
      background: var(--color-active, var(--color-surface-2));
      color: var(--color-text);
      font-weight: var(--weight-medium);
    }
  }

  &__item.router-link-active &__icon {
    color: var(--color-primary);
  }

  &__icon {
    flex-shrink: 0;
  }

  &__label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__foot {
    padding: var(--space-1);
    border-top: 1px solid var(--color-border);
  }
}

.admin--rail-collapsed {
  .rail__label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .rail__head,
  .rail__nav,
  .rail__foot {
    padding: var(--space-2);
  }
  .rail__head {
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }
  .rail__brand {
    width: 100%;
    justify-content: center;
    padding: 0;
    margin: 0;
    gap: 0;
  }
  .rail__toggle,
  .rail__item,
  .rail-account__trigger {
    width: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    margin: 0;
    justify-content: center;
    gap: 0;
  }
}
</style>
