<script setup lang="ts">
import './assets/css/site.css'
import { defaultLocale, prefixPrimary } from '~~/shared/model'
import { localePath } from '../../core/app/utils/locale-path'

const props = defineProps<{ error: { statusCode?: number; statusMessage?: string; message?: string } }>()

const route = useRoute()
const isAdmin = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'))
const locale = computed(() => splitSitePath(route.path).locale)
const isNotFound = computed(() => props.error.statusCode === 404)

const COPY: Record<string, { notFound: string; home: string }> = {
  de: { notFound: 'Seite nicht gefunden', home: 'Zur Startseite' },
  en: { notFound: 'Page not found', home: 'Back to homepage' },
}
const copy = computed(() => COPY[locale.value] ?? COPY[defaultLocale]!)
const homePath = computed(() => (isAdmin.value ? '/admin' : localePath('/', locale.value, defaultLocale, prefixPrimary)))

useHead(() => ({ htmlAttrs: { lang: isAdmin.value ? defaultLocale : locale.value } }))

function goHome(): void {
  clearError({ redirect: homePath.value })
}
</script>

<template>
  <div class="site site-error">
    <main id="site-main" class="site__main site-error__main">
      <p class="site-error__code">{{ error.statusCode ?? '' }}</p>
      <h1 v-if="isNotFound">{{ copy.notFound }}</h1>
      <h1 v-else>{{ error.statusMessage || 'Error' }}</h1>
      <p v-if="!isNotFound && error.message">{{ error.message }}</p>
      <a class="site-error__link" :href="homePath" @click.prevent="goHome">{{ copy.home }}</a>
    </main>
  </div>
</template>

<style scoped lang="scss">
.site-error__main {
  display: grid;
  place-items: center;
  gap: var(--space-4);
  min-height: 100vh;
  padding: var(--space-6);
  text-align: center;
}
.site-error__code {
  margin: 0;
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  color: var(--color-text-muted);
}
.site-error__link {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-on-accent);
  text-decoration: none;
}
.site-error__link:hover {
  text-decoration: underline;
}
.site-error__link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
