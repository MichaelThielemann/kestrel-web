<script setup lang="ts">
import { resolveLocalized } from '#kestrel-admin/utils/localized'

definePageMeta({
  layout: 'admin',
  middleware: 'admin-auth',
  key: (route) => `${String(route.params.collection)}::${typeof route.query.locale === 'string' ? route.query.locale : ''}`,
})

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

const route = useRoute()
const collection = firstParam(route.params.collection)
const localeParam = computed(() => (typeof route.query.locale === 'string' ? route.query.locale.trim() || undefined : undefined))
const { primary } = useContentLocales()

const { t, lang } = useT()
const { collections } = useCollections()
const def = computed(() => collections.value.find((c) => c.name === collection) ?? null)

const listLocale = computed(() => (def.value?.translatable ? (localeParam.value || primary.value) : undefined))
const singletonTitle = computed(() => resolveLocalized(def.value?.label?.singular, lang.value) ?? collection)

if (def.value?.mode === 'single' && def.value.placement === 'system') {
  await navigateTo({ path: '/admin/system', query: { ...route.query, tab: collection } }, { replace: true })
}
</script>

<template>
  <section class="collection">
    <p v-if="!def" class="collection__missing">{{ t('collection.unknown', { name: collection }) }}</p>

    <template v-else-if="def.mode === 'single'">
      <KestrelSingletonEditor v-if="def.placement !== 'system'" :collection="collection" :title="singletonTitle" :locale-param="def.translatable ? localeParam : undefined" />
    </template>

    <template v-else>
      <h1 class="collection__title">{{ resolveLocalized(def.label?.plural, lang) ?? collection }}</h1>
      <KestrelCollectionList :schema="def" :locale="listLocale" />
    </template>
  </section>
</template>

<style lang="scss">

.collection {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  overflow: hidden;

  &__title {
    flex: 0 0 auto;
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    text-transform: capitalize;
  }
  &__missing {
    color: var(--color-text-muted);
  }
}
</style>
