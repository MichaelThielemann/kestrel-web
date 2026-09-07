<script setup lang="ts">

const props = defineProps<{
  collection: string
  id: string
  mode: 'single' | 'multi'
  current: string

  translations?: Record<string, boolean>
}>()

const { locales } = useContentLocales()
const { t } = useT()

const base = computed(() => (props.mode === 'single' ? `/admin/${props.collection}` : `/admin/${props.collection}/${props.id}`))
const linkTo = (loc: string): string => `${base.value}?locale=${encodeURIComponent(loc)}`
const translated = (loc: string): boolean => props.mode === 'single' || props.translations?.[loc] !== false
const up = (s: string) => s.toUpperCase()
</script>

<template>
  <div class="locale-bar" role="group" :aria-label="t('localeBar.groupLabel')">
    <template v-for="loc in locales" :key="loc">
      <span
        v-if="loc === current"
        class="locale-bar__item locale-bar__item--active"
        :class="{ 'locale-bar__item--missing': !translated(loc) }"
        aria-current="true"
      >{{ up(loc) }}</span>

      <NuxtLink
        v-else-if="translated(loc)"
        class="locale-bar__item locale-bar__btn"
        :to="linkTo(loc)"
        :aria-label="t('localeBar.editLocale', { loc: up(loc) })"
      >{{ up(loc) }}<KestrelUiIcon name="pencil" :size="14" /></NuxtLink>

      <NuxtLink
        v-else
        class="locale-bar__item locale-bar__btn locale-bar__btn--add"
        :to="linkTo(loc)"
        :title="t('localeBar.createTranslation', { loc: up(loc) })"
        :aria-label="t('localeBar.createTranslation', { loc: up(loc) })"
      >{{ up(loc) }}<KestrelUiIcon name="plus" :size="14" /></NuxtLink>
    </template>
  </div>
</template>

<style lang="scss">
.locale-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);

  &__item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);

    &--active {
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text);
    }

    &--missing {
      border-style: dashed;
      color: var(--color-text-muted);
    }
  }
  &__btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    text-decoration: none;
    cursor: pointer;

    &:hover {
      border-color: var(--color-text-muted);
      color: var(--color-text);
    }
    &--add {
      border-style: dashed;
      opacity: 0.75;

      &:hover {
        opacity: 1;
      }
    }
  }
}
</style>
