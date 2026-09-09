<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import type { BlockNode, PageSeo } from '#kestrel-admin/types/api'
import { localePath } from '#kestrel-admin/utils/kestrel'
import { editorFormContextKey } from '../utils/editor-form-context'
import { PRESETS, matchPreset, fitScale, clampDim, DIM_MIN, WIDTH_MAX, type ViewportPreset } from '../utils/preview-viewport'

const props = defineProps<{ content: BlockNode[]; selectedId?: string | null }>()
const emit = defineEmits<{ select: [id: string | null] }>()
const { t } = useT()
const toast = useToast()

const ctx = inject(editorFormContextKey, null)
const { primary, prefixPrimary } = useContentLocales()
const siteUrl = computed(() => String(useRuntimeConfig().public.siteUrl ?? '').replace(/\/+$/, ''))
const openUrl = computed(() => {
  if (!siteUrl.value || !ctx) return ''
  const slug = String(ctx.values.slug ?? '').trim()
  return `${siteUrl.value}${localePath(slug ? `/${slug}` : '/', ctx.locale.value, primary, prefixPrimary)}`
})

const previewKeyValue = computed(() => previewKey(ctx?.pageFieldsBindings.value.id))
const iframeSrc = computed(() => (ctx ? `${previewTabPath(previewKeyValue.value)}?embed=1` : ''))

function buildPreviewSnapshot(): PreviewSnapshot {
  const values = ctx!.values
  const document = buildPreviewDocument(
    {
      id: ctx!.pageFieldsBindings.value.id,
      slug: (values.slug as string | null) ?? null,
      title: (values.title as string | null) ?? null,
      body: props.content,
      seo: (values.seo as PageSeo | null) ?? null,
      layout: (values.layout as string | null) ?? null,
    },
    Object.keys(ctx!.pageFieldsBindings.value.fields),
    values,
  )
  return { document, locale: ctx!.locale.value, updatedAt: Date.now() }
}

function publishSnapshot(): void {
  if (!ctx) return
  publishPreview(previewKeyValue.value, buildPreviewSnapshot())
}

function openPreviewTab() {
  if (!ctx) return
  publishSnapshot()
  const win = window.open(previewTabPath(previewKeyValue.value), '_blank')
  if (!win) toast.error(t('editor.previewFailed'))
}

let publishTimer: ReturnType<typeof setTimeout> | null = null
function schedulePreviewPublish() {
  if (!ctx) return
  if (publishTimer) clearTimeout(publishTimer)
  publishTimer = setTimeout(() => {
    publishTimer = null
    publishSnapshot()
  }, 150)
}
watch(() => ctx?.values, schedulePreviewPublish, { deep: true })

const DESKTOP_WIDTH = 1440
const presets = PRESETS(DESKTOP_WIDTH)
const { width, height } = usePreviewViewport(DESKTOP_WIDTH)
const activePreset = computed(() => matchPreset(width.value, height.value, presets))

function selectPreset(p: ViewportPreset) {
  width.value = p.w
  height.value = p.h
}

function onDimCommit(target: 'w' | 'h', e: Event) {
  const el = e.target as HTMLInputElement
  if (el.value === '') {
    if (el.validity?.badInput) return
    if (target === 'w') width.value = 'auto'
    else height.value = 'auto'
    return
  }
  const v = clampDim(Number(el.value), DIM_MIN, target === 'w' ? WIDTH_MAX : HEIGHT_MAX)
  if (v === null) return
  if (target === 'w') width.value = v
  else height.value = v
}

const stage = ref<HTMLElement | null>(null)
const iframeEl = ref<HTMLIFrameElement | null>(null)
const availW = ref(0)
const availH = ref(0)

function reloadPreview() {
  publishSnapshot()
  const iframe = iframeEl.value
  if (!iframe) return
  const target = iframeSrc.value
  iframe.src = ''
  iframe.src = target
}

function onWindowMessage(event: MessageEvent) {
  if (event.source !== iframeEl.value?.contentWindow) return
  const message = parsePreviewMessage(event, window.location.origin)
  if (!message) return
  if (message.type === 'kestrel-preview:select') emit('select', message.id)
  else if (message.type === 'kestrel-preview:ready') iframeEl.value?.contentWindow?.postMessage(selectedMessage(props.selectedId ?? null), window.location.origin)
}

watch(
  () => props.selectedId,
  (id) => iframeEl.value?.contentWindow?.postMessage(selectedMessage(id ?? null), window.location.origin),
)

let ro: ResizeObserver | null = null
const scale = computed(() => fitScale(availW.value, availH.value, width.value, height.value))
const scalePct = computed(() => Math.round(scale.value * 100))
const canvasW = computed(() => (width.value === 'auto' ? Math.max(DIM_MIN, Math.round(availW.value / (scale.value || 1))) : width.value))
const canvasH = computed(() => {
  if (height.value !== 'auto') return height.value
  return Math.round(availH.value / (scale.value || 1))
})

const canvasStyle = computed(() => ({
  width: `${canvasW.value}px`,
  height: `${canvasH.value}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}))
const viewportStyle = computed(() => ({
  width: `${canvasW.value * scale.value}px`,
  height: `${canvasH.value * scale.value}px`,
}))

function contentBox(el: HTMLElement) {
  const cs = getComputedStyle(el)
  return {
    width: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    height: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
  }
}
onMounted(() => {
  publishSnapshot()
  window.addEventListener('message', onWindowMessage)
  const el = stage.value
  if (!el || typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(() => {
    const b = contentBox(el)
    availW.value = b.width
    availH.value = b.height
  })
  ro.observe(el)
  const b = contentBox(el)
  availW.value = b.width
  availH.value = b.height
})
onUnmounted(() => {
  window.removeEventListener('message', onWindowMessage)
  ro?.disconnect()
  ro = null
  if (publishTimer) clearTimeout(publishTimer)
})
</script>

<template>
  <section class="block-preview" :aria-label="t('preview.ariaLabel')">
    <div class="block-preview__bar">
      <p class="block-preview__label">{{ t('preview.label') }}</p>

      <div class="block-preview__tools">
        <KestrelUiTooltip>
          <KestrelUiButton
            type="button"
            variant="ghost"
            size="sm"
            icon="rotate-cw"
            :aria-label="t('preview.refresh')"
            @click="reloadPreview"
          />
          <template #content>{{ t('preview.refresh') }}</template>
        </KestrelUiTooltip>
        <span class="block-preview__sep" aria-hidden="true" />

        <template v-if="ctx">
          <KestrelUiTooltip>
            <KestrelUiButton
              type="button"
              variant="ghost"
              size="sm"
              icon="external-link"
              :aria-label="t('editor.previewUnsaved')"
              @click="openPreviewTab"
            />
            <template #content>{{ t('editor.previewUnsaved') }}</template>
          </KestrelUiTooltip>
          <span class="block-preview__sep" aria-hidden="true" />
        </template>

        <template v-if="openUrl">
          <KestrelUiTooltip>
            <a class="block-preview__open" :href="openUrl" target="_blank" rel="noopener" :aria-label="t('editor.openInNewTab')">
              <KestrelUiIcon name="external-link" :size="16" />
            </a>
            <template #content>{{ t('editor.openInNewTab') }}</template>
          </KestrelUiTooltip>
          <span class="block-preview__sep" aria-hidden="true" />
        </template>

        <div class="block-preview__group" role="group" :aria-label="t('preview.deviceLabel')">
          <KestrelUiTooltip v-for="p in presets" :key="p.key">
            <KestrelUiButton
              type="button"
              variant="ghost"
              size="sm"
              :icon="p.icon"
              :aria-label="t(p.label)"
              :aria-pressed="activePreset === p.key"
              :class="{ 'block-preview__seg--active': activePreset === p.key }"
              @click="selectPreset(p)"
            />
            <template #content>{{ t(p.label) }} · {{ p.w }} × {{ p.h === 'auto' ? t('preview.auto') : p.h }}</template>
          </KestrelUiTooltip>
        </div>

        <span class="block-preview__sep" aria-hidden="true" />

        <span class="block-preview__pct" aria-hidden="true">{{ scalePct }}%</span>

        <span class="block-preview__sep" aria-hidden="true" />

        <div class="block-preview__dims">

          <KestrelUiNumberInput
            slim
            class="block-preview__dim"
            :model-value="width === 'auto' ? null : width"
            :min="DIM_MIN"
            :max="WIDTH_MAX"
            :placeholder="width === 'auto' ? t('preview.auto') : undefined"
            :aria-label="t('preview.width')"
            @change="onDimCommit('w', $event)"
          />
          <span class="block-preview__x" aria-hidden="true">×</span>
          <KestrelUiNumberInput
            slim
            class="block-preview__dim"
            :model-value="height === 'auto' ? null : height"
            :min="DIM_MIN"
            :max="HEIGHT_MAX"
            :placeholder="height === 'auto' ? t('preview.auto') : undefined"
            :aria-label="t('preview.height')"
            @change="onDimCommit('h', $event)"
          />
          <span class="block-preview__unit" aria-hidden="true">px</span>
        </div>
      </div>
    </div>

    <div ref="stage" class="block-preview__stage">
      <div class="block-preview__viewport" :style="viewportStyle">
        <iframe
          v-if="iframeSrc"
          ref="iframeEl"
          class="block-preview__canvas"
          :src="iframeSrc"
          :style="canvasStyle"
          :title="t('preview.frameTitle')"
        />
      </div>
    </div>
  </section>
</template>

<style lang="scss">

.block-preview {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  &__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex: 0 0 auto;
  }

  &__label {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    flex: 0 0 auto;
  }

  &__tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    flex: 1 1 auto;
    min-width: 0;
  }
  &__group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  &__seg--active {
    color: var(--color-primary);
    background: var(--color-surface-2);
  }

  &__open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    text-decoration: none;

    &:hover {
      background: var(--color-surface-2);
      color: var(--color-text);
    }
  }
  &__sep {
    align-self: stretch;
    width: 1px;
    min-height: 1.25rem;
    background: var(--color-border);
  }
  &__pct {
    min-width: 3.5ch;
    text-align: right;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
  &__dims {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__dims .ui-number {
    width: 6rem;
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  &__stage {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    margin: 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-3));
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-2);
    overflow-y: auto;
    overflow-x: hidden;

    @media (max-width: 1100px) {
      height: 70vh;
    }
  }

  &__viewport {
    flex: 0 0 auto;
    box-shadow: 0 0 0 1px var(--color-border);
    background: #fff;
    overflow: hidden;
    transition: width 160ms ease, height 160ms ease;
  }
  &__canvas {
    display: block;
    border: 0;
    background: #fff;
    transition: transform 160ms ease;
  }
}

@media (prefers-reduced-motion: reduce) {
  .block-preview__viewport,
  .block-preview__canvas {
    transition: none;
  }
}
</style>
