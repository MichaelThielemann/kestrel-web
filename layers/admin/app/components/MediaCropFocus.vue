<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { MediaRect } from '#kestrel-admin/types/api'
import { useCropHelpPreference } from '../composables/useCropHelpPreference'
import { FOCUS_MISSES, missesByKind, type FocusMiss, type StatusLine } from '../utils/crop-advice'
import type { FramingDraft } from '../utils/media-crop'

const props = withDefaults(defineProps<{
  src: string
  alt: string
  draft: FramingDraft
  misses?: Readonly<Record<string, FocusMiss | null>>
  cover?: boolean
  error?: string
  disabled?: boolean
}>(), { misses: () => ({}), cover: true, error: '', disabled: false })
const emit = defineEmits<{ focus: [MediaRect | null] }>()
const { t } = useT()
const help = useCropHelpPreference()

const focus = computed({ get: () => props.draft.focus, set: (rect: MediaRect | null) => emit('focus', rect) })
const select = ref<{ focus: () => void } | null>(null)

const lines = computed<StatusLine[]>(() => {
  const groups = missesByKind(props.misses)
  return FOCUS_MISSES.filter((kind) => groups[kind].length).map((kind) => ({
    id: kind,
    text: t(`mediaCrop.missIn.${kind}`, { keys: groups[kind].join(', ') }),
    tone: 'warning',
    attrs: { 'data-test': 'crop-advice', 'data-miss': kind },
  }))
})

async function clearFocus(): Promise<void> {
  focus.value = null
  await nextTick()
  select.value?.focus()
}

defineExpose({ focus: () => select.value?.focus() })
</script>

<template>
  <KestrelUiRectSelect ref="select" v-model="focus" v-model:help="help" :src="src" :alt="alt" :label="t('mediaCrop.focusLabel')" :disabled="disabled" class="media-crop-focus">
    <template #aside-start>
      <h3 class="media-crop-focus__title">{{ t('mediaCrop.focusTitle') }}</h3>
    </template>
    <template #help-intro>
      <p class="media-crop-focus__intro">{{ t('mediaCrop.focusIntro') }}</p>
    </template>
    <template #aside-end>
      <KestrelMediaCropStatus :lines="lines" :error="error">
        <template #state>
          <p class="media-crop-focus__state" data-test="crop-focus-state">{{ focus ? t('mediaCrop.focusSet') : t('mediaCrop.noFocus') }}</p>
          <p v-if="!cover" class="media-crop-focus__state" data-test="crop-no-cover">{{ t('mediaCrop.noCover') }}</p>
        </template>
        <template #action>
          <KestrelUiButton variant="ghost" size="sm" icon="eraser" data-test="crop-clear-focus" :disabled="disabled || !focus" @click="clearFocus">{{ t('mediaCrop.clearFocus') }}</KestrelUiButton>
        </template>
      </KestrelMediaCropStatus>
    </template>
  </KestrelUiRectSelect>
</template>

<style lang="scss" scoped>
.media-crop-focus__title { margin: 0; font-size: var(--text-base); font-weight: var(--weight-medium); }
.media-crop-focus__intro { margin: 0 0 var(--space-2); }
.media-crop-focus__state { margin: 0; color: var(--color-text-muted); }
</style>
