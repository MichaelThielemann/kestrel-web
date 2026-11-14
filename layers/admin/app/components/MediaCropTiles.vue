<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { focusFits } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaFramingRatio, MediaRect } from '#kestrel-admin/types/api'
import { useCropSnapPreference } from '../composables/useCropSnapPreference'
import { displayCrop, smallerSizes, type CropSize, type FramingDraft } from '../utils/media-crop'

const props = withDefaults(defineProps<{
  src: string
  alt: string
  draft: FramingDraft
  ratios: readonly MediaFramingRatio[]
  usages?: Readonly<Record<string, readonly string[]>>
  sizes: readonly CropSize[]
  width: number
  height: number
  disabled?: boolean
}>(), { usages: () => ({}), disabled: false })
const selected = defineModel<string>('selected', { required: true })
const emit = defineEmits<{ crop: [key: string, rect: MediaRect | null], pending: [boolean] }>()
const { t } = useT()
const snap = useCropSnapPreference()

const tiles = computed(() => props.ratios.map((ratio) => ({
  key: ratio.key,
  sizes: ratio.sizes,
  uses: (props.usages[ratio.key] ?? ratio.sizes).join(', '),
  crop: displayCrop(props.draft, ratio.key, props.width, props.height),
  manual: Object.hasOwn(props.draft.crops, ratio.key),
  fits: focusFits(props.draft, ratio.key, props.width, props.height),
})))
const active = computed(() => tiles.value.find((tile) => tile.key === selected.value) ?? tiles.value[0] ?? null)
const smaller = computed(() => (active.value?.crop ? smallerSizes(active.value.crop, active.value.sizes, props.sizes) : []))
const crop = computed({
  get: () => (active.value ? props.draft.crops[active.value.key] ?? null : null),
  set: (rect: MediaRect | null) => { if (active.value) emit('crop', active.value.key, rect) },
})
const stateLabel = (manual: boolean) => (manual ? t('mediaCrop.manual') : t('mediaCrop.auto'))
const frame = ref<{ focus: () => void } | null>(null)
const list = ref<HTMLElement | null>(null)

async function reset(): Promise<void> {
  crop.value = null
  await nextTick()
  frame.value?.focus()
}

function revealActive(): void {
  const tile = list.value?.querySelector<HTMLElement>('[aria-pressed="true"]')
  if (typeof tile?.scrollIntoView === 'function') tile.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

onMounted(revealActive)
const stopReveal = watch(() => active.value?.key, revealActive, { flush: 'post' })
onUnmounted(stopReveal)
</script>

<template>
  <div class="media-crop-tiles">
    <ul ref="list" class="media-crop-tiles__list" :aria-label="t('mediaCrop.tiles')">
      <li v-for="tile in tiles" :key="tile.key">
        <KestrelUiButton
          variant="bare"
          class="media-crop-tiles__tile"
          :aria-pressed="tile.key === active?.key"
          :data-key="tile.key"
          @click="selected = tile.key"
        >
          <KestrelMediaCropPreview :src="src" :crop="tile.crop" :width="width" />
          <span class="media-crop-tiles__key">{{ tile.key }}</span>
          <span class="media-crop-tiles__uses" data-test="crop-uses">{{ tile.uses }}</span>
          <span class="media-crop-tiles__state" :data-state="tile.manual ? 'manual' : 'auto'">{{ stateLabel(tile.manual) }}</span>
          <span v-if="!tile.fits" class="media-crop-tiles__warn"><KestrelUiIcon name="triangle-alert" :size="14" /><span class="media-crop-tiles__sr">{{ t('mediaCrop.focusMisses') }}</span></span>
        </KestrelUiButton>
      </li>
    </ul>
    <div v-if="active" class="media-crop-tiles__detail" data-test="crop-detail">
      <div class="media-crop-tiles__head">
        <div class="media-crop-tiles__heading">
          <h3 class="media-crop-tiles__title">{{ t('mediaCrop.ratioTitle', { key: active.key, sizes: active.uses }) }}</h3>
          <span class="media-crop-tiles__state" :data-state="active.manual ? 'manual' : 'auto'" data-test="crop-state">{{ stateLabel(active.manual) }}</span>
        </div>
        <KestrelUiButton variant="ghost" size="sm" icon="rotate-ccw" data-test="crop-reset" :disabled="disabled || !active.manual" @click="reset">{{ t('mediaCrop.reset') }}</KestrelUiButton>
        <KestrelUiSwitch v-model="snap" :label="t('mediaCrop.snap')" data-test="crop-snap" />
      </div>
      <KestrelUiAlert v-if="!active.fits" variant="warning" data-test="crop-misses">{{ t('mediaCrop.focusMissesDetail') }}</KestrelUiAlert>
      <KestrelUiAlert v-if="smaller.length" variant="info" data-test="crop-smaller">{{ t('mediaCrop.smaller', { sizes: smaller.join(', ') }) }}</KestrelUiAlert>
      <KestrelUiCropFrame
        :key="active.key"
        ref="frame"
        v-model="crop"
        :src="src"
        :alt="alt"
        :label="t('mediaCrop.frameLabel', { key: active.key })"
        :ratio="active.key"
        :width="width"
        :height="height"
        :focus="draft.focus"
        :disabled="disabled"
        :snap="snap"
        @pending="emit('pending', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../assets/scss/mixins';

.media-crop-tiles {
  display: grid;
  grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  --ui-crop-frame-max-height: 50vh;
}
.media-crop-tiles__list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-2);
  max-height: calc(var(--ui-crop-frame-max-height) + 12rem);
  margin: 0;
  padding: var(--space-1);
  scroll-padding: var(--space-1);
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}
@media (max-width: 48rem) {
  .media-crop-tiles { grid-template-columns: minmax(0, 1fr); }
  .media-crop-tiles__list {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: minmax(8rem, 10rem);
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
  }
}
.media-crop-tiles__tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  width: 100%;
  height: 100%;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;

  &:hover { background: var(--color-hover); }
  &:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  &[aria-pressed='true'] { border-color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
}
.media-crop-tiles__key { font-weight: var(--weight-medium); font-size: var(--text-sm); }
.media-crop-tiles__uses { font-size: var(--text-xs); color: var(--color-text); overflow-wrap: anywhere; }
.media-crop-tiles__state { font-size: var(--text-xs); color: var(--color-text-muted); }
.media-crop-tiles__state[data-state='manual'] { color: var(--color-primary-on-fill, var(--color-primary)); font-weight: var(--weight-medium); }
.media-crop-tiles__warn { position: absolute; top: var(--space-1); right: var(--space-1); display: inline-flex; padding: 2px; border-radius: var(--radius-full); background: var(--color-surface); color: var(--color-warning-text); }
.media-crop-tiles__sr { @include mixins.sr-only; }
.media-crop-tiles__detail { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; padding: var(--space-1); }
.media-crop-tiles__head { display: flex; align-items: center; gap: var(--space-2) var(--space-4); flex-wrap: wrap; }
.media-crop-tiles__heading { display: flex; align-items: baseline; gap: var(--space-1) var(--space-3); flex-wrap: wrap; min-width: 0; margin-inline-end: auto; }
.media-crop-tiles__title { margin: 0; font-size: var(--text-base); font-weight: var(--weight-medium); overflow-wrap: anywhere; }
</style>
