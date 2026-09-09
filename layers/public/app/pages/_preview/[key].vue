<script setup lang="ts">
import type { LayoutKey } from '#app'
import { defaultLocale, previewBanner } from '~~/shared/model'
import { resolvePageLayout } from '../../utils/page-layout'
import type { PageDocument } from '#kestrel-core/app/types/api'

definePageMeta({ key: (route) => route.fullPath, layout: false })

const route = useRoute()
const key = computed(() => String(route.params.key ?? 'new'))
const isEmbed = computed(() => route.query.embed === '1')
const showBanner = computed(() => previewBanner && (!isEmbed.value || (import.meta.client && window.parent === window)))

const snapshot = ref<PreviewSnapshot | null>(null)
const content = ref<HTMLElement | null>(null)
const selectedId = ref<string | null>(null)

const COPY: Record<string, { banner: string; missingTitle: string; missingBody: string; unknownLabel: (type: string) => string; errorLabel: string }> = {
  de: {
    banner: 'Vorschau — ungespeicherte Änderungen, nicht veröffentlicht',
    missingTitle: 'Keine Vorschau verfügbar',
    missingBody: 'Dieser Vorschau-Tab hat keine Daten mehr. Öffne die Vorschau erneut aus dem Editor.',
    unknownLabel: (type) => `Unbekannter Blocktyp „${type}“.`,
    errorLabel: 'Block konnte nicht gerendert werden:',
  },
  en: {
    banner: 'Preview — unsaved changes, not published',
    missingTitle: 'No preview available',
    missingBody: 'This preview tab has no data. Reopen the preview from the editor.',
    unknownLabel: (type) => `Unknown block type "${type}".`,
    errorLabel: 'Block could not be rendered:',
  },
}
const copy = computed(() => COPY[snapshot.value?.locale ?? defaultLocale] ?? COPY[defaultLocale]!)

const page = computed<PageDocument | null>(() => {
  const doc = snapshot.value?.document
  if (!doc) return null
  return previewPageDocument(doc, snapshot.value?.updatedAt ?? 0)
})
const pageLayout = computed(() => resolvePageLayout(page.value?.layout) as LayoutKey)

const sharedPage = useSitePage()
watchEffect(() => {
  sharedPage.value = page.value
})

function stripKestrelHrefs(): void {
  if (!content.value) return
  for (const a of content.value.querySelectorAll<HTMLAnchorElement>('a[href^="kestrel:"]')) a.setAttribute('href', '#')
}

function onSelect(id: string | null): void {
  if (!isEmbed.value) return
  selectedId.value = id
  window.parent.postMessage(selectMessage(id), window.location.origin)
}

function onWindowMessage(event: MessageEvent): void {
  const message = parsePreviewMessage(event, window.location.origin)
  if (message?.type === 'kestrel-preview:selected') selectedId.value = message.id
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target
  const anchor = target instanceof Element ? target.closest('a[href]') : null
  if (anchor) event.preventDefault()
  if (selectedId.value !== null && !(target instanceof Element && target.closest('.block-marker'))) onSelect(null)
}

let unsubscribe: (() => void) | null = null
onMounted(() => {
  snapshot.value = readPreviewSnapshot(key.value)
  unsubscribe = subscribePreview(key.value, (next) => {
    snapshot.value = next
  })
  if (isEmbed.value) {
    document.documentElement.classList.add('kestrel-embed')
    window.addEventListener('message', onWindowMessage)
    document.addEventListener('click', onDocumentClick, true)
    window.parent.postMessage(readyMessage(), window.location.origin)
  }
})
onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
  window.removeEventListener('message', onWindowMessage)
  document.removeEventListener('click', onDocumentClick, true)
  document.documentElement.classList.remove('kestrel-embed')
})

watch(
  () => snapshot.value?.document.body,
  () => nextTick(stripKestrelHrefs),
  { deep: true },
)

const previewLocale = computed(() => snapshot.value?.locale ?? defaultLocale)
const { data: siteSettings } = await useSiteSettings(previewLocale)
useHead(() => {
  const seo = page.value?.seo ?? {}
  return {
    htmlAttrs: { lang: previewLocale.value },
    titleTemplate: siteTitleTemplate(siteSettings.value?.title, siteSettings.value?.titleSeparator, siteSettings.value?.titlePosition),
    title: seo.title || page.value?.title || '',
    meta: [
      { name: 'robots', content: 'noindex' },
      ...(seo.description ? [{ name: 'description', content: seo.description }] : []),
    ],
  }
})
</script>

<template>
  <NuxtLayout :name="pageLayout" fallback="default">
    <article v-if="page" class="site-page preview-page">
      <p v-if="showBanner" class="preview-page__banner" role="status">{{ copy.banner }}</p>
      <div ref="content">
        <KestrelBlockRenderer
          :nodes="page.body ?? []"
          :editable="isEmbed"
          :selected-id="selectedId"
          :unknown-label="copy.unknownLabel"
          :error-label="copy.errorLabel"
          @select="onSelect"
        />
      </div>
    </article>
    <div v-else class="preview-page preview-page__empty">
      <p v-if="showBanner" class="preview-page__banner" role="status">{{ copy.banner }}</p>
      <h1>{{ copy.missingTitle }}</h1>
      <p>{{ copy.missingBody }}</p>
    </div>
  </NuxtLayout>
</template>

<style scoped lang="scss">
.preview-page {
  &__banner {
    margin: 0;
    padding: var(--space-2) var(--space-4);
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-align: center;
    border-bottom: 1px solid var(--site-line);
  }
  &__empty {
    display: flex;
    flex-direction: column;
    min-height: 100vh;

    h1,
    p {
      margin: var(--space-2) var(--space-6);
    }
  }
}
</style>
