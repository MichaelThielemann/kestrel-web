<script setup lang="ts">

import '#kestrel-admin/assets/scss/main.scss'
import { installAdminClient } from '../utils/admin-client'

installAdminClient()
useAdminBodyClass()
const { authenticated } = useAuth()
const capabilities = useCapabilities()
const { hasAccess: hasSystemAccess } = useSystemTabs()
const { collapsed: cookieCollapsed, toggle: toggleCookieCollapsed } = useRailCollapsed()
const isPhone = useIsPhone()
const { theme } = useTheme()
const { t, lang } = useT()
const route = useRoute()
const routePath = computed(() => route.path)
const { railOpen, railCollapsed, toggleRail, closeRailOverlay } = useRailOverlay({
  isPhone,
  routePath,
  collapsed: cookieCollapsed,
  toggleCollapsed: toggleCookieCollapsed,
})
const { failed: bootFailed, error: bootError } = useBootStatus()
const { error: schemaError } = useSchema()
const schemaFailed = computed(() => authenticated.value && schemaError.value !== null)
const failed = computed(() => bootFailed.value || schemaFailed.value)
const failure = computed(() => (schemaFailed.value ? schemaError.value : bootError.value))

useHead(() => ({
  title: 'Kestrel',
  titleTemplate: (title) => (title && title !== 'Kestrel' ? `${title} · Kestrel` : 'Kestrel'),
  htmlAttrs: { lang: lang.value, 'data-theme': theme.value, style: 'font-size: initial' },
}))
</script>

<template>
  <KestrelUiPortalHost />
  <KestrelReauthDialog v-if="authenticated" />
  <KestrelBootFailure v-if="failed" :error="failure" />
  <div v-else class="admin" :class="{ 'admin--rail-collapsed': railCollapsed, 'admin--rail-open': isPhone && railOpen }" :data-theme="theme">
    <div v-if="isPhone && railOpen" class="admin__scrim" aria-hidden="true" @click="closeRailOverlay" />
    <aside v-if="authenticated" id="admin-rail" class="admin__rail">
      <div class="rail__head">
        <NuxtLink to="/admin" class="rail__brand" aria-label="Kestrel">
          <KestrelUiBrand />
          <span class="rail__brand-word rail__label">kestrel</span>
        </NuxtLink>
        <KestrelUiButton
          variant="icon"
          class="rail__toggle"
          :aria-label="railCollapsed ? t('a11y.expandSidebar') : t('a11y.collapseSidebar')"
          :aria-expanded="isPhone ? railOpen : undefined"
          :aria-controls="isPhone ? 'admin-rail' : undefined"
          @click="toggleRail"
        >
          <KestrelUiIcon :name="railCollapsed ? 'panel-left-open' : 'panel-left-close'" size="1.25rem" />
        </KestrelUiButton>
      </div>

      <div class="rail__nav">
        <NuxtLink
          to="/admin"
          class="rail__item rail__item--dashboard"
          :title="railCollapsed ? t('nav.dashboard') : undefined"
        >
          <KestrelUiIcon name="home" class="rail__icon" size="1.25rem" />
          <span class="rail__label">{{ t('nav.dashboard') }}</span>
        </NuxtLink>

        <KestrelAdminNav />
      </div>

      <div class="rail__foot">
        <KestrelAdminAccount />
        <NuxtLink
          v-if="capabilities.has('insightsManifest')"
          to="/admin/insights"
          class="rail__item"
          :class="{ 'router-link-active': isNavItemActive(route.path, '/admin/insights') }"
          :title="railCollapsed ? t('nav.insights') : undefined"
        >
          <KestrelUiIcon name="activity" class="rail__icon" size="1.25rem" />
          <span class="rail__label">{{ t('nav.insights') }}</span>
        </NuxtLink>
        <NuxtLink
          v-if="hasSystemAccess"
          to="/admin/system"
          class="rail__item"
          :class="{ 'router-link-active': isNavItemActive(route.path, '/admin/system') }"
          :title="railCollapsed ? t('nav.system') : undefined"
        >
          <KestrelUiIcon name="settings" class="rail__icon" size="1.25rem" />
          <span class="rail__label">{{ t('nav.system') }}</span>
        </NuxtLink>
      </div>
    </aside>

    <main class="admin__main" :inert="isPhone && railOpen"><slot /></main>
    <KestrelUiToasts />
  </div>
</template>

<style lang="scss">
$bp-phone: 640px;

@mixin rail-narrow {
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

.admin {
  display: flex;
  align-items: flex-start;

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
    color: var(--color-primary-text);
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
  @include rail-narrow;
}

@media (max-width: $bp-phone) {
  .admin__scrim {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-overlay) - 1);
    background: var(--color-scrim);
  }

  .admin:not(.admin--rail-open) .admin__rail {
    flex-basis: var(--rail-width-collapsed);
    width: var(--rail-width-collapsed);
  }

  .admin:not(.admin--rail-open) {
    @include rail-narrow;
  }

  .admin--rail-open .admin__rail {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: var(--z-overlay);
    box-shadow: var(--shadow-lg);
  }
}
</style>
