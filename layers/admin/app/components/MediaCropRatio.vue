<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { MediaFramingRatio, MediaRect } from '#kestrel-admin/types/api'
import { useCropHelpPreference } from '../composables/useCropHelpPreference'
import { useCropSnapPreference } from '../composables/useCropSnapPreference'
import type { FocusMiss, StatusLine } from '../utils/crop-advice'
import { displayCrop, smallerSizes, type CropSize, type FramingDraft } from '../utils/media-crop'

const props = withDefaults(defineProps<{
  src: string
  alt: string
  draft: FramingDraft
  ratio: MediaFramingRatio
  uses?: readonly string[]
  sizes: readonly CropSize[]
  miss?: FocusMiss | null
  width: number
  height: number
  error?: string
  disabled?: boolean
}>(), { uses: () => [], miss: null, error: '', disabled: false })
const emit = defineEmits<{ crop: [key: string, rect: MediaRect | null], pending: [boolean] }>()
const { t } = useT()
const snap = useCropSnapPreference()
const help = useCropHelpPreference()

const key = computed(() => props.ratio.key)
const manual = computed(() => Object.hasOwn(props.draft.crops, key.value))
const crop = computed({
  get: () => props.draft.crops[key.value] ?? null,
  set: (rect: MediaRect | null) => emit('crop', key.value, rect),
})
const smaller = computed(() => {
  const shown = displayCrop(props.draft, key.value, props.width, props.height)
  return shown ? smallerSizes(shown, props.ratio.sizes, props.sizes) : []
})

const lines = computed<StatusLine[]>(() => {
  const out: StatusLine[] = []
  if (props.miss) {
    const text = props.miss === 'covered' ? t('mediaCrop.advice.covered') : t(`mediaCrop.advice.${props.miss}`, { key: key.value })
    out.push({ id: 'advice', text, tone: 'warning', attrs: { 'data-test': 'crop-advice', 'data-miss': props.miss } })
  }
  if (smaller.value.length) {
    const sizes = smaller.value.join(', ')
    out.push({ id: 'smaller', text: manual.value ? t('mediaCrop.smallerManual', { sizes }) : t('mediaCrop.smaller', { sizes }), tone: 'info', attrs: { 'data-test': 'crop-smaller' } })
  }
  return out
})

const frame = ref<{ focus: () => void } | null>(null)

async function reset(): Promise<void> {
  crop.value = null
  await nextTick()
  frame.value?.focus()
}

defineExpose({ focus: () => frame.value?.focus() })
</script>

<template>
  <KestrelUiCropFrame
    ref="frame"
    v-model="crop"
    v-model:help="help"
    class="media-crop-ratio"
    data-test="crop-ratio"
    :src="src"
    :alt="alt"
    :label="t('mediaCrop.frameLabel', { key })"
    :ratio="key"
    :width="width"
    :height="height"
    :focus="draft.focus"
    :disabled="disabled"
    :snap="snap"
    @pending="emit('pending', $event)"
  >
    <template #aside-start>
      <h3 class="media-crop-ratio__title">{{ t('mediaCrop.ratioTitle', { key }) }}</h3>
      <p class="media-crop-ratio__uses" data-test="crop-ratio-uses">{{ (uses.length ? uses : ratio.sizes).join(', ') }}</p>
    </template>
    <template #aside-end>
      <KestrelUiSwitch v-model="snap" :label="t('mediaCrop.snap')" data-test="crop-snap" />
      <KestrelMediaCropStatus :lines="lines" :error="error">
        <template #state>
          <p class="media-crop-ratio__state" :data-state="manual ? 'manual' : 'auto'" data-test="crop-state">{{ manual ? t('mediaCrop.manual') : t('mediaCrop.auto') }}</p>
        </template>
        <template #action>
          <KestrelUiButton variant="ghost" size="sm" icon="rotate-ccw" data-test="crop-reset" :disabled="disabled || !manual" @click="reset">{{ t('mediaCrop.reset') }}</KestrelUiButton>
        </template>
      </KestrelMediaCropStatus>
    </template>
  </KestrelUiCropFrame>
</template>

<style lang="scss" scoped>
.media-crop-ratio__title { margin: 0; font-size: var(--text-base); font-weight: var(--weight-medium); }
.media-crop-ratio__uses { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--color-text-muted); overflow-wrap: anywhere; }
.media-crop-ratio__state { margin: 0; color: var(--color-text-muted); }
.media-crop-ratio__state[data-state='manual'] { color: var(--color-primary-on-fill, var(--color-primary)); font-weight: var(--weight-medium); }
</style>
