<script setup lang="ts">
import { computed, nextTick, ref, toRef, useId, watch } from 'vue'
import type { MediaItem, MediaRect } from '#kestrel-admin/types/api'
import { useMediaCropEditor } from '../composables/useMediaCropEditor'
import { cropSource } from '../utils/media-crop'

const props = defineProps<{ open: boolean, item: MediaItem | null }>()
const emit = defineEmits<{ 'update:open': [boolean], saved: [MediaItem] }>()
const { t } = useT()
const idPrefix = `media-crop-${useId()}`
const root = ref<HTMLElement | null>(null)
const editor = useMediaCropEditor(toRef(props, 'item'), toRef(props, 'open'))
const { current, draft, dirty, busy, error, usage, width, height, ratios, sizes } = editor

const tab = ref('focus')
const selected = ref('')
const status = ref('')
const pending = ref(false)
const hasCover = computed(() => ratios.value.length > 0)
const tabs = computed(() => [{ id: 'focus', label: t('mediaCrop.tab.focus') }, { id: 'crop', label: t('mediaCrop.tab.crop') }])
const src = computed(() => (current.value ? cropSource(current.value) ?? current.value.path : ''))
const alt = computed(() => props.item?.alt ?? props.item?.filename ?? '')
const panelAttrs = (id: string) => (hasCover.value ? { 'role': 'tabpanel', 'id': `${idPrefix}-panel-${id}`, 'aria-labelledby': `${idPrefix}-tab-${id}` } : {})

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  tab.value = 'focus'
  pending.value = false
  selected.value = ratios.value[0]?.key ?? ''
  status.value = ''
}, { immediate: true })

function onSelect(key: string): void {
  selected.value = key
  const manual = Object.hasOwn(draft.value.crops, key)
  status.value = t('mediaCrop.selected', { key, state: manual ? t('mediaCrop.manual') : t('mediaCrop.auto') })
}

function onCrop(key: string, rect: MediaRect | null): void {
  editor.setCrop(key, rect)
  if (rect === null) status.value = t('mediaCrop.resetDone', { key })
}

function onOpenAutoFocus(event: Event): void {
  event.preventDefault()
  void nextTick(() => {
    const target = root.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? root.value?.querySelector<HTMLElement>('.ui-rect-select__surface')
    target?.focus()
  })
}

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
    @update:open="onOpenChange"
    @open-auto-focus="onOpenAutoFocus"
    @escape-key-down="onEscape"
  >
    <div v-if="item" ref="root" class="media-crop">
      <div class="media-crop__bar">
        <KestrelUiTabList v-if="hasCover" v-model="tab" :tabs="tabs" :id-prefix="idPrefix" :label="t('mediaCrop.tabs')" />
        <p v-if="usage !== null" class="media-crop__usage" data-test="crop-usage">{{ t('mediaCrop.usage', { n: usage }) }}</p>
      </div>
      <div v-if="tab === 'focus' || !hasCover" v-bind="panelAttrs('focus')" class="media-crop__panel">
        <KestrelMediaCropFocus :src="src" :alt="alt" :draft="draft" :ratios="ratios" :width="width" :height="height" :disabled="busy" @focus="editor.setFocus" />
      </div>
      <div v-else v-bind="panelAttrs('crop')" class="media-crop__panel">
        <KestrelMediaCropTiles
          :selected="selected"
          :src="src"
          :alt="alt"
          :draft="draft"
          :ratios="ratios"
          :sizes="sizes"
          :width="width"
          :height="height"
          :disabled="busy"
          @update:selected="onSelect"
          @crop="onCrop"
          @pending="pending = $event"
        />
      </div>
      <KestrelUiAlert v-if="error" variant="error" class="media-crop__error">{{ error }}</KestrelUiAlert>
      <KestrelUiLiveStatus :message="status" />
    </div>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="onOpenChange(false)">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton ref="saveButton" variant="primary" :loading="busy" :disabled="busy || !(dirty || pending)" @click="onSave">{{ t('common.save') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.media-crop { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.media-crop__bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.media-crop__usage { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }
.media-crop__panel { min-width: 0; }
</style>
