<script setup lang="ts">
import {
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuItemIndicator, DropdownMenuItem,
} from 'reka-ui'
import { resolveLocalized } from '#kestrel-admin/utils/localized'

const { t, lang } = useT()
const { logout, username } = useAuth()
const { theme, toggle: toggleTheme } = useTheme()
const { collections } = useCollections()

const displayName = computed(() => username.value || t('account.name'))
const initials = computed(() => (username.value.slice(0, 2).toUpperCase() || 'AD'))
const accountCollections = computed(() => collections.value.filter((c) => c.mode === 'single' && c.nav !== false && c.placement === 'account'))

const changePasswordOpen = ref(false)

function selectLang(value: unknown) { lang.value = value as string }
function signOut() { logout() }

defineExpose({ lang, selectLang, signOut, theme, toggleTheme })
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button type="button" class="rail-account__trigger" :aria-label="t('account.label')" :title="t('account.label')">
        <span class="rail-account__avatar" aria-hidden="true">{{ initials }}</span>
        <span class="rail-account__name rail__label">{{ displayName }}</span>
        <KestrelUiIcon name="chevron-down" class="rail-account__caret" size="1rem" />
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        class="rail-account__menu"
        side="top"
        align="start"
        :side-offset="6"
        :collision-padding="8"
      >
        <DropdownMenuLabel class="rail-account__head">
          <span class="rail-account__avatar rail-account__avatar--sm" aria-hidden="true">{{ initials }}</span>
          <span class="rail-account__head-name">{{ displayName }}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator class="rail-account__sep" />

        <DropdownMenuLabel class="rail-account__group-label">{{ t('lang.label') }}</DropdownMenuLabel>
        <DropdownMenuRadioGroup :model-value="lang" @update:model-value="selectLang">
          <DropdownMenuRadioItem
            v-for="l in ADMIN_LANGS"
            :key="l"
            :value="l"
            class="rail-account__item"
          >
            <span class="rail-account__check">
              <DropdownMenuItemIndicator>
                <KestrelUiIcon name="check" size="1rem" />
              </DropdownMenuItemIndicator>
            </span>
            <span>{{ l.toUpperCase() }}</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator class="rail-account__sep" />

        <DropdownMenuItem class="rail-account__item" :aria-label="theme === 'dark' ? t('a11y.toLight') : t('a11y.toDark')" @select.prevent="toggleTheme">
          <KestrelUiIcon :name="theme === 'dark' ? 'sun' : 'moon'" size="1rem" class="rail-account__item-icon" />
          <span>{{ theme === 'dark' ? t('theme.light') : t('theme.dark') }}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator class="rail-account__sep" />

        <DropdownMenuItem class="rail-account__item" @select="changePasswordOpen = true">
          <KestrelUiIcon name="settings" size="1rem" class="rail-account__item-icon" />
          <span>{{ t('account.password.menu') }}</span>
        </DropdownMenuItem>

        <template v-if="accountCollections.length">
          <DropdownMenuSeparator class="rail-account__sep" />
          <DropdownMenuLabel class="rail-account__group-label">{{ t('account.collections') }}</DropdownMenuLabel>
          <DropdownMenuItem
            v-for="c in accountCollections"
            :key="c.name"
            class="rail-account__item"
            @select="navigateTo(`/admin/${c.name}`)"
          >
            <KestrelUiIcon :name="c.icon ?? 'file-text'" size="1rem" class="rail-account__item-icon" />
            <span>{{ resolveLocalized(c.label?.singular, lang) ?? c.name }}</span>
          </DropdownMenuItem>
        </template>

        <DropdownMenuItem class="rail-account__item rail-account__item--danger" @select="signOut">
          <KestrelUiIcon name="log-out" size="1rem" class="rail-account__item-icon" />
          <span>{{ t('nav.signOut') }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>

  <KestrelChangePasswordDialog v-model:open="changePasswordOpen" />
</template>

<style lang="scss">

.rail-account__trigger {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-1);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--color-hover);
  }
  &:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }
  &[data-state='open'] {
    background: var(--color-active, var(--color-surface-2));
  }
}

.rail-account__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-strong, var(--color-border));
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: var(--text-xs, 0.75rem);
  font-weight: var(--weight-bold);
  letter-spacing: 0.02em;

  &--sm {
    width: 1.5rem;
    height: 1.5rem;
  }
}

.rail-account__name {
  font-weight: var(--weight-medium);
}
.rail-account__caret {
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--color-text-muted);
}
.admin--rail-collapsed .rail-account__caret {
  display: none;
}

.rail-account__menu {
  min-width: 13rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-1);
  z-index: var(--z-dropdown);
}

.rail-account__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2);
}
.rail-account__head-name {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.rail-account__group-label {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs, 0.75rem);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.rail-account__sep {
  height: 1px;
  margin: var(--space-1) calc(var(--space-1) * -1);
  background: var(--color-border);
}

.rail-account__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-text);
  cursor: pointer;
  user-select: none;

  &[data-highlighted] {
    background: var(--color-hover);
    outline: none;
  }
  &--danger {
    color: var(--color-danger);
  }
}

.rail-account__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  flex-shrink: 0;
  color: var(--color-primary);
}
.rail-account__item-icon {
  flex-shrink: 0;
}

.admin--rail-collapsed .rail-account__trigger {
  justify-content: center;
  gap: 0;
}
</style>
