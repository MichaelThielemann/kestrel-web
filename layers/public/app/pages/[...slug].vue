<script setup lang="ts">
import type { LayoutKey } from '#app'
import { defaultLocale, homeSlug, locales, prefixPrimary, untranslatedPages } from '~~/shared/model'
import { localePath } from '#kestrel-core/app/utils/locale-path'
import { isFallbackDocument, primaryPathOf } from '../utils/untranslated'
import { resolvePageLayout } from '../utils/page-layout'
import type { PageDocument, RedirectHit, SiteResponse } from '#kestrel-core/app/types/api'

definePageMeta({ key: (route) => route.path, layout: false })

const route = useRoute()
const locale = useSiteLocale()
const api = useApi()

function redirectOf(value: unknown): RedirectHit | null {
  return value && typeof value === 'object' && 'redirect' in value
    ? (value as { redirect: RedirectHit }).redirect
    : null
}

const { data, error } = await useAsyncData(
  () => `site:${route.path}`,
  () => api<SiteResponse>(`/site${route.path}`),
)
const response = data as Ref<SiteResponse | null | undefined>

const redirect = redirectOf(response.value)

if (redirect) {
  await navigateTo(redirect.to, { redirectCode: redirect.status, external: /^https?:/.test(redirect.to) })
}

const page = computed<PageDocument | null>(() =>
  response.value && !redirectOf(response.value) ? (response.value as PageDocument) : null,
)
const pageLayout = computed(() => resolvePageLayout(page.value?.layout) as LayoutKey)

if (!redirect && !page.value) {
  const status = apiErrorStatus(error.value)
  throw createError({
    statusCode: status >= 400 ? status : 404,
    statusMessage: status >= 500 ? 'Site unavailable' : 'Page not found',
    fatal: true,
  })
}

if (page.value && isFallbackDocument(page.value, locale.value)) {
  if (untranslatedPages === 'redirect') {
    await navigateTo(primaryPathOf(page.value, defaultLocale, prefixPrimary, homeSlug), { redirectCode: 302 })
  } else {
    throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
  }
}

const { data: localeLinks } = await useAsyncData<SiteLocaleLink[]>(
  () => `site:locales:${page.value?.id ?? ''}`,
  async () => {
    const doc = page.value
    if (!doc) return []
    const links: SiteLocaleLink[] = []
    for (const target of locales) {
      if (target === locale.value) {
        links.push({ locale: target, path: route.path, current: true })
        continue
      }
      if (doc._translations?.[target] !== true) continue
      const sibling = await api<PageDocument>(`/pages/${doc.id}`, { query: { locale: target } }).catch((e: unknown) => {
        if (apiErrorStatus(e) !== 404) console.error(`Locale links: "${doc.id}" (${target}) could not be loaded: ${apiErrorMessage(e)}`)
        return null
      })
      if (!sibling?.slug || sibling.status !== 'published') continue
      const path = localePath(sibling.slug === homeSlug ? '/' : `/${sibling.slug}`, target, defaultLocale, prefixPrimary)
      links.push({ locale: target, path, current: false })
    }
    return links
  },
  { default: (): SiteLocaleLink[] => [] },
)

const shared = useSiteLocaleLinks()
watchEffect(() => {
  shared.value = localeLinks.value
})

const sharedPage = useSitePage()
watchEffect(() => {
  sharedPage.value = page.value
})

const siteUrl = useRuntimeConfig().public.siteUrl as string
const { data: siteSettings } = await useSiteSettings(locale)
useHead(() => {
  const seo = page.value?.seo ?? {}
  const title = seo.title || page.value?.title || ''
  const image = page.value?.shareImage ? `${siteUrl}${mediaFileUrl(page.value.shareImage)}` : ''
  return {
    htmlAttrs: { lang: locale.value },
    titleTemplate: siteTitleTemplate(siteSettings.value?.title, siteSettings.value?.titleSeparator, siteSettings.value?.titlePosition),
    title,
    meta: [
      ...(seo.description ? [{ name: 'description', content: seo.description }, { property: 'og:description', content: seo.description }] : []),
      ...(seo.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
      { property: 'og:title', content: title },
      { property: 'og:type', content: 'website' },
      ...(image ? [{ property: 'og:image', content: image }, { name: 'twitter:card', content: 'summary_large_image' }] : []),
    ],
  }
})
</script>

<template>
  <NuxtLayout :name="pageLayout" fallback="default">
    <article v-if="page" class="site-page">
      <KestrelBlockRenderer :nodes="page.body ?? []" />
    </article>
  </NuxtLayout>
</template>
