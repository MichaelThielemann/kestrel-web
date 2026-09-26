<script setup lang="ts">
import type { LayoutKey } from '#app'
import { defaultLocale, homeSlug, locales, prefixPrimary, untranslatedPages } from '~~/shared/model'
import { isFallbackDocument, primaryPathOf } from '../utils/untranslated'
import { resolvePageLayout } from '../utils/page-layout'
import { isPageResponse, isRedirectResponse, isRouteHint, redirectNavigation } from '../utils/site-redirect'
import { sitePath } from '../utils/site-path'
import { toPublicSiteResponse } from '../utils/public-shapes'
import type { PublicPageDocument, PublicSiteResponse, SiteResponse } from '#kestrel-core/app/types/api'
import { boundaryCast } from '#kestrel/cast'

definePageMeta({ key: (route) => route.path, layout: false })

const PAGES_COLLECTION = 'pages'

const route = useRoute()
const locale = useSiteLocale()
const api = useApi()

const { data, error } = await useAsyncData(
  () => `site:${sitePath(route.path)}`,
  async (): Promise<SiteResponse> => {
    const path = sitePath(route.path)
    const answer = await api<SiteResponse>(`/site${path}`)
    if (!isRouteHint(answer)) return answer
    const document = await api<SiteResponse>(`/routes/${answer.route.type}${path}`)
    return 'id' in document ? { ...document, _collection: answer.route.type } : document
  },
  { transform: toPublicSiteResponse },
)
const response = boundaryCast<Ref<PublicSiteResponse | null | undefined>>(data, 'host')
const redirectHit = response.value && isRedirectResponse(response.value) ? response.value.redirect : null

if (redirectHit) {
  await navigateTo(...redirectNavigation(redirectHit))
}

const page = computed<PublicPageDocument | null>(() =>
  response.value && isPageResponse(response.value) ? response.value : null,
)
const collection = computed(() => collectionOf(page.value) ?? PAGES_COLLECTION)
const collectionView = useCollectionView(() => collection.value)
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- resolvePageLayout may return a stale/unregistered name on purpose; NuxtLayout's fallback prop renders "default" when it isn't a real LayoutKey
const pageLayout = computed(() => resolvePageLayout(page.value?.layout) as LayoutKey)

if (!redirectHit && !page.value) {
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

const localeLinks = computed<SiteLocaleLink[]>(() => {
  const doc = page.value
  if (!doc) return []
  return locales.flatMap((target): SiteLocaleLink[] => {
    if (target === locale.value) return [{ locale: target, path: route.path, current: true }]
    const path = doc._paths?.[target]
    if (doc._translations?.[target] !== true || typeof path !== 'string') return []
    return [{ locale: target, path, current: false }]
  })
})

const shared = useSiteLocaleLinks()
watchEffect(() => {
  shared.value = localeLinks.value
})

const sharedPage = useSitePage()
watchEffect(() => {
  sharedPage.value = page.value
})

const siteUrl = useRuntimeConfig().public.siteUrl
const [{ data: siteSettings }, { data: shareItem }] = await Promise.all([
  useSiteSettings(locale),
  useMediaItem(() => page.value?.shareImage ?? null, locale),
])
useHead(() => {
  const seo = page.value?.seo ?? {}
  const title = seo.title || page.value?.title || ''
  const description = metaDescription(seo.description, siteSettings.value?.description)
  const image = shareItem.value ? `${siteUrl}${shareItem.value.path}` : ''
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
    <component :is="collectionView" v-if="page && collectionView" :document="page" :collection="collection" />
    <article v-else-if="page" class="site-page" :data-collection="collection === PAGES_COLLECTION ? undefined : collection">
      <KestrelBlockRenderer :nodes="page.body ?? []" />
    </article>
  </NuxtLayout>
</template>
