<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { focusFits } from '@michaelthielemann/kestrel-images-default/framing'
import type { MediaFramingRatio, MediaRect } from '#kestrel-admin/types/api'
import { displayCrop, type FramingDraft } from '../utils/media-crop'

const props = defineProps<{ src: string, alt: string, draft: FramingDraft, ratios: readonly MediaFramingRatio[], width: number, height: number, disabled?: boolean }>()
const emit = defineEmits<{ focus: [MediaRect | null] }>()
const { t } = useT()

const focus = computed({ get: () => props.draft.focus, set: (rect: MediaRect | null) => emit('focus', rect) })
const select = ref<{ focus: () => void } | null>(null)

async function clearFocus(): Promise<void> {
  focus.value = null
  await nextTick()
  select.value?.focus()
}
const previews = computed(() => props.ratios.map((ratio) => ({
  key: ratio.key,
  sizes: ratio.sizes.join(', '),
  crop: displayCrop(props.draft, ratio.key, props.width, props.height),
  manual: Object.hasOwn(props.draft.crops, ratio.key),
  fits: focusFits(props.draft, ratio.key, props.width, props.height),
})))
</script>

<template>
  <div class="media-crop-focus">
    <div class="media-crop-focus__editor">
      <p class="media-crop-focus__intro">{{ t('mediaCrop.focusIntro') }}</p>
      <KestrelUiRectSelect ref="select" v-model="focus" :src="src" :alt="alt" :label="t('mediaCrop.focusLabel')" :disabled="disabled" />
      <div class="media-crop-focus__actions">
        <span class="media-crop-focus__state">{{ focus ? t('mediaCrop.focusSet') : t('mediaCrop.noFocus') }}</span>
        <KestrelUiButton variant="ghost" size="sm" icon="eraser" data-test="crop-clear-focus" :disabled="disabled || !focus" @click="clearFocus">{{ t('mediaCrop.clearFocus') }}</KestrelUiButton>
      </div>
    </div>
    <section v-if="previews.length" class="media-crop-focus__previews" :aria-label="t('mediaCrop.previews')">
      <h3 class="media-crop-focus__heading">{{ t('mediaCrop.previews') }}</h3>
      <ul class="media-crop-focus__list">
        <li v-for="p in previews" :key="p.key" class="media-crop-focus__item" data-test="crop-preview">
          <KestrelMediaCropPreview :src="src" :crop="p.crop" :width="width" />
          <span class="media-crop-focus__key">{{ p.key }}</span>
          <span class="media-crop-focus__sizes">{{ p.sizes }}</span>
          <span v-if="p.manual" class="media-crop-focus__note">{{ t('mediaCrop.manual') }}</span>
          <span v-if="!p.fits" class="media-crop-focus__warn"><KestrelUiIcon name="triangle-alert" :size="14" />{{ t('mediaCrop.focusMisses') }}</span>
        </li>
      </ul>
    </section>
    <p v-else class="media-crop-focus__none" data-test="crop-no-cover">{{ t('mediaCrop.noCover') }}</p>
  </div>
</template>

<style lang="scss" scoped>
.media-crop-focus {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 16rem);
  gap: var(--space-4);
  align-items: start;
  --ui-rect-select-max-height: 55vh;
}
@media (max-width: 48rem) {
  .media-crop-focus { grid-template-columns: 1fr; }
}
.media-crop-focus__editor { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.media-crop-focus__intro,
.media-crop-focus__none { margin: 0; color: var(--color-text-muted); font-size: var(--text-sm); }
.media-crop-focus__actions { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.media-crop-focus__state { font-size: var(--text-sm); color: var(--color-text-muted); }
.media-crop-focus__heading { margin: 0 0 var(--space-2); font-size: var(--text-sm); font-weight: var(--weight-medium); }
.media-crop-focus__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.media-crop-focus__item { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; font-size: var(--text-xs); }
.media-crop-focus__key { font-weight: var(--weight-medium); font-size: var(--text-sm); }
.media-crop-focus__sizes,
.media-crop-focus__note { color: var(--color-text-muted); overflow-wrap: anywhere; }
.media-crop-focus__warn { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--color-warning-text); }
</style>
