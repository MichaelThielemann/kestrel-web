<script setup lang="ts">
import type { LayoutKey } from '#app'
import { contentTypes, defaultLocale, homeSlug, locales, prefixPrimary, untranslatedPages } from '~~/shared/model'
import collectionsUi from '~~/shared/collections-ui'
import { resolveWorkflow } from '#kestrel/collections-ui'
import { localePath } from '#kestrel-core/app/utils/locale-path'
import { isFallbackDocument, primaryPathOf } from '../utils/untranslated'
import { resolvePageLayout } from '../utils/page-layout'
import type { PageDocument, RedirectHit, SiteResponse } from '#kestrel-core/app/types/api'
import { boundaryCast } from '#kestrel/cast'

definePageMeta({ key: (route) => route.path, layout: false })

const PAGES_COLLECTION = 'pages'
const pagesModel = contentTypes[PAGES_COLLECTION]
const pagesWorkflow = pagesModel ? resolveWorkflow(PAGES_COLLECTION, pagesModel, collectionsUi[PAGES_COLLECTION]) : undefined

const route = useRoute()
const locale = useSiteLocale()
const api = useApi()

function redirectOf(value: SiteResponse): RedirectHit | null {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- PageDocument inherits an index signature ([field: string]: unknown), so TS cannot discriminate SiteResponse by the "redirect" key alone
  return 'redirect' in value ? (value as { redirect: RedirectHit }).redirect : null
}

const { data, error } = await useAsyncData(
  () => `site:${route.path}`,
  () => api<SiteResponse>(`/site${route.path}`),
)
const response = boundaryCast<Ref<SiteResponse | null | undefined>>(data, 'host')

const redirect = response.value ? redirectOf(response.value) : null

if (redirect) {
  await navigateTo(redirect.to, { redirectCode: redirect.status, external: /^https?:/.test(redirect.to) })
}

const page = computed<PageDocument | null>(() =>
  response.value && !redirectOf(response.value) ? boundaryCast<PageDocument>(response.value, 'json') : null,
)
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- resolvePageLayout may return a stale/unregistered name on purpose; NuxtLayout's fallback prop renders "default" when it isn't a real LayoutKey
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
      if (!sibling?.slug) continue
      if (pagesWorkflow && sibling[pagesWorkflow.field] !== pagesWorkflow.live) continue
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

const siteUrl = useRuntimeConfig().public.siteUrl
const { data: siteSettings } = await useSiteSettings(locale)
useHead(() => {
  const seo = page.value?.seo ?? {}
  const title = seo.title || page.value?.title || ''
  const description = metaDescription(seo.description, siteSettings.value?.description)
  const image = page.value?.shareImage ? `${siteUrl}${mediaFileUrl(page.value.shareImage)}` : ''
  return {
    htmlAttrs: { lang: locale.value },
    titleTemplate: siteTitleTemplate(siteSettings.value?.title, siteSettings.value?.titleSeparator, siteSettings.value?.titlePosition),
    title,
    meta: [
      ...(description ? [{ name: 'description', content: description }, { property: 'og:description', content: description }] : []),
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
