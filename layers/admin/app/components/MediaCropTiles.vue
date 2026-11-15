<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PixelCrop } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaFramingRatio, MediaRect } from '#kestrel-admin/types/api'
import type { FocusMiss } from '../utils/crop-advice'
import { CROP_NARROW_QUERY, FOCUS_TILE, displayCrop, tileId, type FramingDraft } from '../utils/media-crop'

const props = withDefaults(defineProps<{
  idPrefix: string
  src: string
  draft: FramingDraft
  ratios: readonly MediaFramingRatio[]
  usages?: Readonly<Record<string, readonly string[]>>
  misses?: Readonly<Record<string, FocusMiss | null>>
  width: number
  height: number
}>(), { usages: () => ({}), misses: () => ({}) })
const selected = defineModel<string>('selected', { required: true })
const { t } = useT()
const narrow = useMediaQuery(CROP_NARROW_QUERY)

interface Tile {
  id: string
  key: string
  label: string
  title: string
  detail: string
  state: 'manual' | 'auto' | 'set' | 'none'
  stateLabel: string
  crop: PixelCrop | null
  focus: MediaRect | null
  warning: string
}

function tile(fields: Omit<Tile, 'id' | 'label'>): Tile {
  const label = [fields.title, fields.detail, fields.stateLabel, fields.warning].filter(Boolean).join(' ')
  return { ...fields, id: tileId(fields.key), label }
}

const focusTile = computed(() => {
  const missed = props.ratios.filter((ratio) => props.misses[ratio.key]).length
  const focus = props.draft.focus
  return tile({
    key: FOCUS_TILE,
    title: t('mediaCrop.focusTile'),
    detail: t('mediaCrop.focusScope'),
    state: focus ? 'set' : 'none',
    stateLabel: focus ? t('mediaCrop.focusShort.set') : t('mediaCrop.focusShort.none'),
    crop: props.width > 0 && props.height > 0 ? { left: 0, top: 0, width: props.width, height: props.height } : null,
    focus,
    warning: missed ? t('mediaCrop.missCount', { n: missed, total: props.ratios.length }) : '',
  })
})

const tiles = computed(() => [focusTile.value, ...props.ratios.map((ratio) => {
  const manual = Object.hasOwn(props.draft.crops, ratio.key)
  const miss = props.misses[ratio.key]
  return tile({
    key: ratio.key,
    title: ratio.key,
    detail: (props.usages[ratio.key] ?? ratio.sizes).join(', '),
    state: manual ? 'manual' : 'auto',
    stateLabel: manual ? t('mediaCrop.manual') : t('mediaCrop.auto'),
    crop: displayCrop(props.draft, ratio.key, props.width, props.height),
    focus: null,
    warning: miss ? t(`mediaCrop.miss.${miss}`) : '',
  })
})])

function choose(id: string): void {
  const chosen = tiles.value.find((candidate) => candidate.id === id)
  if (chosen) selected.value = chosen.key
}

const list = ref<HTMLElement | null>(null)

function revealSelected(): void {
  const chosen = list.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  if (typeof chosen?.scrollIntoView === 'function') chosen.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

onMounted(revealSelected)
const stopReveal = watch(selected, revealSelected, { flush: 'post' })
onUnmounted(stopReveal)
</script>

<template>
  <div ref="list" class="media-crop-tiles">
    <KestrelUiTabList
      :tabs="tiles"
      :model-value="tileId(selected)"
      :id-prefix="idPrefix"
      :label="t('mediaCrop.tiles')"
      variant="tiles"
      :orientation="narrow ? 'horizontal' : 'vertical'"
      @update:model-value="choose"
    >
      <template #tab="{ tab }">
        <span class="media-crop-tiles__tile" :data-key="tab.key" :data-state="tab.state">
          <span class="media-crop-tiles__thumb">
            <KestrelMediaCropPreview :src="src" :crop="tab.crop" :width="width" :height="height" :focus="tab.focus" />
          </span>
          <span class="media-crop-tiles__text">
            <span class="media-crop-tiles__key">{{ tab.title }}</span>{{ ' ' }}
            <span class="media-crop-tiles__uses" data-test="crop-uses">{{ tab.detail }}</span>{{ ' ' }}
            <span class="media-crop-tiles__state" :data-state="tab.state">{{ tab.stateLabel }}</span>
          </span>
          <span v-if="tab.warning" class="media-crop-tiles__warn" data-test="crop-tile-warning">
            {{ ' ' }}<KestrelUiIcon name="triangle-alert" :size="14" class="media-crop-tiles__warn-icon" /><span class="media-crop-tiles__warn-text">{{ tab.warning }}</span>
          </span>
        </span>
      </template>
    </KestrelUiTabList>
  </div>
</template>

<style lang="scss" scoped>
@use '../assets/scss/crop-stage';

.media-crop-tiles {
  min-width: 0;
  min-height: 0;
  padding: var(--space-2) var(--space-2) var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding: var(--space-2);
  scrollbar-gutter: stable;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.media-crop-tiles__tile {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
}
.media-crop-tiles__thumb {
  display: grid;
  place-items: center;
  width: 4.5rem;
  height: 3.5rem;

  :deep(.media-crop-preview) { width: min(100%, calc(3.5rem * var(--media-crop-preview-ratio, 1))); }
}
.media-crop-tiles__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.media-crop-tiles__key { font-weight: var(--weight-medium); font-size: var(--text-sm); }
.media-crop-tiles__uses { font-size: var(--text-xs); overflow-wrap: anywhere; }
.media-crop-tiles__state { font-size: var(--text-xs); color: var(--color-text-muted); }
.media-crop-tiles__state[data-state='manual'],
.media-crop-tiles__state[data-state='set'] { color: var(--color-primary-on-fill, var(--color-primary)); font-weight: var(--weight-medium); }
.media-crop-tiles__warn {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--color-warning-text);
  overflow-wrap: anywhere;
}
.media-crop-tiles__warn-icon { flex: 0 0 auto; margin-top: 1px; }

@media (max-width: crop-stage.$narrow) {
  .media-crop-tiles {
    --ui-tabs-tile-width: 10.5rem;

    padding-bottom: var(--space-3);
    overflow-x: auto;
    overflow-y: hidden;
  }
  .media-crop-tiles__tile { grid-template-columns: minmax(0, 1fr); }
  .media-crop-tiles__thumb { width: 100%; height: 4rem; }
  .media-crop-tiles__warn {
    position: absolute;
    top: calc(var(--space-2) + 4rem);
    left: var(--space-2);
    max-width: calc(100% - 2 * var(--space-2));
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    box-shadow: 0 0 0 1px var(--color-border);
    transform: translateY(-100%);
  }
  .media-crop-tiles__thumb :deep(.media-crop-preview) { width: min(100%, calc(4rem * var(--media-crop-preview-ratio, 1))); }
}
</style>
