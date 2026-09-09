<script setup lang="ts">

import '../assets/css/site.css'
import type { NavigationItem } from '~~/shared/model'
import { defaultLocale, prefixPrimary, locales } from '~~/shared/model'
import { localePath } from '#kestrel-core/app/utils/locale-path'
import { linkHrefOf } from '../composables/useLinkHref'

interface Chrome { skip: string; navigation: string; language: string }

const FALLBACK_CHROME: Chrome = { skip: 'Skip to content', navigation: 'Main navigation', language: 'Language' }
const CHROME: Record<string, Chrome> = {
  en: FALLBACK_CHROME,
  de: { skip: 'Zum Inhalt springen', navigation: 'Hauptnavigation', language: 'Sprache' },
}

const route = useRoute()
const locale = useSiteLocale()
const { data: settings } = await useSiteSettings(locale)
const pageLinks = useSiteLocaleLinks()

const chrome = computed(() => CHROME[locale.value] ?? FALLBACK_CHROME)
const homePath = computed(() => localePath('/', locale.value, defaultLocale, prefixPrimary))

const localeLinks = computed(() =>
  pageLinks.value.length > 0
    ? pageLinks.value
    : locales.map((l) => ({ locale: l, path: localePath('/', l, defaultLocale, prefixPrimary), current: l === locale.value })),
)

const navHref = (item: NavigationItem): string | null => linkHrefOf(item.link)

const localeName = (code: string): string => {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

</script>

<template>
  <div class="site">
    <a class="site__skip" href="#site-main">{{ chrome.skip }}</a>

    <header class="site__header">
      <p class="site__title">
        <NuxtLink :to="homePath">{{ settings.title || 'Kestrel' }}</NuxtLink>
      </p>

      <nav v-if="settings.navigation.length" class="site__nav" :aria-label="chrome.navigation">
        <ul class="site__nav-list">
          <li v-for="(item, itemIndex) in settings.navigation" :key="`${item.label}-${itemIndex}`" class="site__nav-item">
            <NuxtLink
              v-if="navHref(item)"
              :to="navHref(item)!"
              :target="item.target === '_blank' ? '_blank' : undefined"
              :rel="item.target === '_blank' ? 'noopener noreferrer' : undefined"
              :aria-current="navHref(item) === route.path ? 'page' : undefined"
            >
              {{ item.label }}
            </NuxtLink>
            <span v-else>{{ item.label }}</span>

            <ul v-if="item.children?.length" class="site__nav-sublist">
              <li v-for="(child, childIndex) in item.children" :key="`${child.label}-${childIndex}`">
                <NuxtLink
                  v-if="navHref(child)"
                  :to="navHref(child)!"
                  :target="child.target === '_blank' ? '_blank' : undefined"
                  :rel="child.target === '_blank' ? 'noopener noreferrer' : undefined"
                >
                  {{ child.label }}
                </NuxtLink>
                <span v-else>{{ child.label }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </nav>

      <nav v-if="localeLinks.length > 1" class="site__locales" :aria-label="chrome.language">
        <template v-for="link in localeLinks" :key="link.locale">
          <span v-if="link.current" :lang="link.locale" aria-current="true">{{ localeName(link.locale) }}</span>
          <NuxtLink v-else :to="link.path" :lang="link.locale" :hreflang="link.locale">{{ localeName(link.locale) }}</NuxtLink>
        </template>
      </nav>
    </header>

    <main id="site-main" class="site__main">
      <slot />
    </main>

    <footer class="site__footer">
      <p>{{ settings.title }}</p>
    </footer>
  </div>
</template>
