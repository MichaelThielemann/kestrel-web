<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, toRef, useId, watch } from 'vue'
import type { MediaItem, MediaRect } from '#kestrel-admin/types/api'
import { useMediaCropEditor } from '../composables/useMediaCropEditor'
import { FOCUS_TILE, cropSource, initialTile, tileId } from '../utils/media-crop'

const props = withDefaults(defineProps<{ open: boolean, item: MediaItem | null, sizes?: readonly string[] }>(), { sizes: () => [] })
const emit = defineEmits<{ 'update:open': [boolean], saved: [MediaItem] }>()
const { t } = useT()
const idPrefix = `media-crop-${useId()}`
const root = ref<HTMLElement | null>(null)
const editor = useMediaCropEditor(toRef(props, 'item'), toRef(props, 'open'))
const { current, draft, dirty, busy, error, usage, width, height, measureFailed, ratios, usages, sizes: cropSizes, misses } = editor

const selected = ref(FOCUS_TILE)
const status = ref('')
const pending = ref(false)
const hasCover = computed(() => ratios.value.length > 0)
const measured = computed(() => width.value > 0 && height.value > 0)
const measuringStatus = ref<HTMLElement | null>(null)
const ratio = computed(() => ratios.value.find((candidate) => candidate.key === selected.value) ?? null)
const src = computed(() => (current.value ? cropSource(current.value) : null) ?? (props.item ? cropSource(props.item) : null) ?? '')
const locked = computed(() => busy.value || src.value === '')
const alt = computed(() => props.item?.alt ?? props.item?.filename ?? '')
const description = computed(() => (usage.value === null ? t('mediaCrop.usageUnknown') : t('mediaCrop.usage', { n: usage.value })))
const panelAttrs = computed(() => {
  if (!hasCover.value) return {}
  const id = tileId(ratio.value ? selected.value : FOCUS_TILE)
  return { 'role': 'tabpanel', 'id': `${idPrefix}-panel-${id}`, 'aria-labelledby': `${idPrefix}-tab-${id}` }
})

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  pending.value = false
  selected.value = initialTile(ratios.value, props.sizes)
  status.value = ''
}, { immediate: true })

const stopRatios = watch(ratios, (list) => {
  if (selected.value !== FOCUS_TILE && !list.some((candidate) => candidate.key === selected.value)) selected.value = FOCUS_TILE
})
onUnmounted(stopRatios)

function onCrop(key: string, rect: MediaRect | null): void {
  editor.setCrop(key, rect)
  if (rect === null) status.value = t('mediaCrop.resetDone', { key })
}

const initialTarget = () => root.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? root.value?.querySelector<HTMLElement>('.ui-rect-select__surface') ?? measuringStatus.value

function onOpenAutoFocus(event: Event): void {
  event.preventDefault()
  void nextTick(() => initialTarget()?.focus())
}

const stopMeasured = watch(measured, (isMeasured) => {
  if (!isMeasured || !import.meta.client) return
  const active = document.activeElement
  if (active !== measuringStatus.value && active !== null && root.value?.contains(active)) return
  void nextTick(() => initialTarget()?.focus())
})
onUnmounted(stopMeasured)

const saveButton = ref<{ focus: () => void } | null>(null)
let discardConfirmed = false
const confirmDiscard = () => confirm(t('mediaCrop.discardConfirm'))
const unsaved = () => dirty.value || pending.value

function onEscape(event: KeyboardEvent): void {
  if (!unsaved()) return
  if (confirmDiscard()) discardConfirmed = true
  else event.preventDefault()
}

function onOpenChange(value: boolean): void {
  if (value) {
    emit('update:open', true)
    return
  }
  if (unsaved() && !discardConfirmed && !confirmDiscard()) return
  discardConfirmed = false
  emit('update:open', false)
}

async function onSave(): Promise<void> {
  if (!dirty.value || busy.value) return
  status.value = t('mediaCrop.saving')
  const saved = await editor.save()
  if (!saved) {
    status.value = error.value
    await nextTick()
    saveButton.value?.focus()
    return
  }
  status.value = ''
  emit('saved', saved)
  emit('update:open', false)
}
</script>

<template>
  <KestrelUiDialog
    :open="open"
    nested
    size="screen"
    :title="t('mediaCrop.title', { name: item?.filename ?? '' })"
    :description="description"
    @update:open="onOpenChange"
    @open-auto-focus="onOpenAutoFocus"
    @escape-key-down="onEscape"
  >
    <div v-if="item" ref="root" class="media-crop" :class="{ 'media-crop--single': !hasCover }">
      <KestrelMediaCropTiles
        v-if="hasCover"
        v-model:selected="selected"
        :id-prefix="idPrefix"
        :src="src"
        :draft="draft"
        :ratios="ratios"
        :usages="usages"
        :misses="misses"
        :width="width"
        :height="height"
      />
      <div v-bind="panelAttrs" class="media-crop__panel">
        <div v-if="!measured" class="media-crop__measuring">
          <p ref="measuringStatus" role="status" tabindex="-1">{{ measureFailed ? t('mediaCrop.measureFailed') : t('mediaCrop.measuring') }}</p>
        </div>
        <KestrelMediaCropRatio
          v-else-if="ratio"
          :key="ratio.key"
          :src="src"
          :alt="alt"
          :draft="draft"
          :ratio="ratio"
          :uses="usages[ratio.key]"
          :sizes="cropSizes"
          :miss="misses[ratio.key] ?? null"
          :width="width"
          :height="height"
          :error="error"
          :disabled="locked"
          @crop="onCrop"
          @pending="pending = $event"
        />
        <KestrelMediaCropFocus v-else :src="src" :alt="alt" :draft="draft" :misses="misses" :cover="hasCover" :error="error" :disabled="locked" @focus="editor.setFocus" />
      </div>
      <KestrelUiLiveStatus :message="status" />
    </div>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="onOpenChange(false)">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton ref="saveButton" variant="primary" :loading="busy" :disabled="busy || !(dirty || pending)" @click="onSave">{{ t('common.save') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.media-crop {
  display: grid;
  grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: var(--space-2);
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.media-crop--single { grid-template-columns: minmax(0, 1fr); }
.media-crop__panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}
.media-crop__measuring {
  display: grid;
  place-items: center;
  min-height: 12rem;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  color: var(--color-text-muted);

  p { margin: 0; }
}

@media (max-width: 48rem) {
  .media-crop {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-auto-rows: max-content;
    align-content: start;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }
  .media-crop__panel { grid-template-rows: none; min-height: auto; }
}
</style>
