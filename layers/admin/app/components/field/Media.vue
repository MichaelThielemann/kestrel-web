<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ListPage, MediaItem } from '#kestrel-admin/types/api'
import type { FieldComponentProps } from '../../utils/field-component'
import { fieldIs } from '#kestrel-admin/types/kestrel'
import { commonFolder } from '#kestrel-admin/utils/library'
import { isDisclosed, provenanceLabelKey, provenanceOrigin } from '#kestrel-admin/utils/provenance'
import { isInsertable } from '#kestrel-admin/utils/media-insert'
import { onMediaChanged, onMediaFramed, onMediaRemoved } from '#kestrel-admin/composables/useMediaChanges'
import { lookUpMedia } from '#kestrel-admin/composables/useMediaPick'
import { useMediaSettle } from '#kestrel-admin/composables/useMediaSettle'
import { canFrame } from '#kestrel-admin/utils/media-crop'

const props = defineProps<FieldComponentProps>()
const model = defineModel<string | string[] | null>()

const api = useAdminApi()
const capabilities = useCapabilities()
const { t } = useT()
const options = computed(() => {
  const field = props.field
  return fieldIs(field, 'media') ? field.options : undefined
})
const required = computed(() => !!props.field.required)
const multiple = computed(() => !!options.value?.multiple)
const accept = computed(() => options.value?.accept ?? 'any')
const pickerOpen = ref(false)

const ids = computed<string[]>(() => {
  const v = model.value
  if (multiple.value) return Array.isArray(v) ? v : []
  return typeof v === 'string' && v ? [v] : []
})

const meta = ref<Record<string, MediaItem | null>>({})
const trashed = ref<Record<string, string>>({})
const processingError = ref('')

function removeId(id: string) {
  if (multiple.value) model.value = (Array.isArray(model.value) ? model.value : []).filter((x) => x !== id)
  else model.value = null
}

async function resolve(missing: string[]) {
  if (!missing.length) return
  for (const id of missing) meta.value[id] = null
  if (!capabilities.has('listMedia')) return
  try {
    const page = await api<ListPage<MediaItem>>(capabilities.route('listMedia'), { query: { ids: missing.join(','), locale: props.locale } })
    for (const item of page.items) meta.value[item.id] = item
    const unresolved = missing.filter((id) => !meta.value[id])
    for (const [id, filename] of await findTrashed(api, capabilities, unresolved)) trashed.value[id] = filename
  } catch {
    return
  }
}

watch(ids, (list) => resolve(list.filter((id) => !(id in meta.value))), { immediate: true })

function reresolve(changed: readonly string[]) {
  const held = ids.value.filter((id) => changed.includes(id))
  if (!held.length) return
  const keep = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([id]) => !held.includes(id)))
  meta.value = keep(meta.value)
  trashed.value = keep(trashed.value)
  return resolve(held)
}
onMediaRemoved(reresolve)
onMediaChanged(({ restored }) => reresolve(restored))

const resolved = computed(() => ids.value.map((id) => ({ id, item: meta.value[id] ?? null })))

async function refresh(id: string) {
  if (!ids.value.includes(id) || !capabilities.has('listMedia')) return
  try {
    const page = await api<ListPage<MediaItem>>(capabilities.route('listMedia'), { query: { ids: id, locale: props.locale } })
    const item = page.items.find((found) => found.id === id)
    if (item && ids.value.includes(id)) meta.value[id] = item
  } catch {
    return
  }
}
useMediaSettle(() => resolved.value.map((r) => r.item), (id) => { void refresh(id) })
const storedHint = computed(() => (resolved.value.some((r) => r.item !== null && !isInsertable(r.item)) ? t('field.media.storedProcessing') : ''))
const trashedHint = computed(() => (resolved.value.some((r) => r.item === null && trashed.value[r.id] !== undefined) ? t('field.media.trashedHint') : ''))

const initialFolder = computed(() => (resolved.value.length ? commonFolder(resolved.value.map((r) => r.item?.folder ?? '')) : undefined))

const cropItem = ref<MediaItem | null>(null)
const cropOpen = ref(false)
const canCrop = (item: MediaItem | null) => capabilities.has('setMediaFraming') && canFrame(item)
function openCrop(item: MediaItem) {
  cropItem.value = item
  cropOpen.value = true
}
function onFramed(item: MediaItem) {
  if (item.id in meta.value) meta.value[item.id] = item
}
onMediaFramed(onFramed)

const nameOf = (id: string, item: MediaItem | null, i: number) => item?.filename ?? trashed.value[id] ?? t('field.media.itemAt', { pos: i + 1 })

async function onConfirm(picked: string[]) {
  processingError.value = ''
  const newIds = picked.filter((id) => !ids.value.includes(id))
  if (newIds.length && capabilities.has('listMedia')) {
    const found = new Map<string, MediaItem>()
    try {
      for (const item of await lookUpMedia(api, capabilities.route('listMedia'), newIds, props.locale)) found.set(item.id, item)
    } catch {
      return
    }
    for (const [id, item] of found) meta.value[id] = item
    if (newIds.some((id) => !found.has(id))) {
      processingError.value = t('field.media.gone')
      return
    }
    if ([...found.values()].some((item) => !isInsertable(item))) {
      processingError.value = t('field.media.processing')
      return
    }
  }
  if (multiple.value) model.value = [...new Set(picked)]
  else model.value = picked[0] ?? null
}
</script>

<template>
  <KestrelUiField :id="id" :label="name" :error="error" :required="required">
    <template #default="f">
      <div class="field-media">
        <KestrelUiAlert v-if="processingError" variant="error">{{ processingError }}</KestrelUiAlert>
        <KestrelUiAlert v-else-if="storedHint" variant="info">{{ storedHint }}</KestrelUiAlert>
        <KestrelUiAlert v-if="trashedHint" variant="warning">{{ trashedHint }}</KestrelUiAlert>
        <ul v-if="resolved.length" class="field-media__items">
          <li v-for="(r, i) in resolved" :key="r.id" class="field-media__item">
            <KestrelMediaThumb :path="r.item?.path ?? null" class="field-media__thumb" :content-type="r.item?.contentType" :alt="r.item?.alt ?? r.item?.filename ?? ''" />
            <span class="field-media__filename">{{ nameOf(r.id, r.item, i) }}</span>
            <span v-if="isDisclosed(r.item?.provenance)" class="field-media__ai">{{ t(provenanceLabelKey(provenanceOrigin(r.item?.provenance))) }}</span>
            <span v-if="!r.item && trashed[r.id] !== undefined" class="field-media__trashed">{{ t('field.media.trashed') }}</span>
            <KestrelUiButton v-if="r.item && canCrop(r.item)" variant="icon" class="field-media__crop" :aria-label="t('mediaCrop.openFor', { name: nameOf(r.id, r.item, i) })" @click="r.item && openCrop(r.item)"><KestrelUiIcon name="crop" size="1rem" /></KestrelUiButton>
            <KestrelUiButton v-if="!disabled" variant="icon" class="field-media__remove" :aria-label="t('field.media.remove', { name: nameOf(r.id, r.item, i) })" @click="removeId(r.id)"><KestrelUiIcon name="x" size="1rem" /></KestrelUiButton>
          </li>
        </ul>
        <p v-else class="field-media__empty">{{ t('field.media.empty') }}</p>
        <KestrelUiButton
          v-if="!disabled && capabilities.has('listMediaFolders')"
          :id="f.id"
          type="button"
          variant="secondary"
          :aria-invalid="f['aria-invalid']"
          :aria-describedby="f['aria-describedby']"
          @click="pickerOpen = true"
        >
          {{ multiple ? t('field.media.add') : (resolved.length ? t('field.media.replace') : t('field.media.select')) }}
        </KestrelUiButton>
      </div>
      <KestrelMediaCropEditor v-if="cropItem" v-model:open="cropOpen" :item="cropItem" @saved="onFramed" />
      <KestrelMediaPicker v-model:open="pickerOpen" :multiple="multiple" :accept="accept" :initial-folder="initialFolder" :initial-selected="ids" @confirm="onConfirm" />
    </template>
  </KestrelUiField>
</template>

<style lang="scss" scoped>
.field-media { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.field-media__items { display: flex; flex-wrap: wrap; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
.field-media__item { position: relative; display: flex; flex-direction: column; gap: var(--space-1); width: 80px; }
.field-media__thumb { width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-md); background: var(--color-bg); border: 1px solid var(--color-border); }
.field-media__filename { max-width: 80px; font-size: var(--text-xs); color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-media__ai {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-scrim);
  color: var(--color-on-primary);
  font-size: var(--text-xs);
  pointer-events: none;
}

.field-media__trashed {
  font-size: var(--text-xs);
  color: var(--color-warning-text);
}

.field-media__crop,
.field-media__remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 1.75rem;
  height: 1.75rem;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--color-overlay);
  color: var(--color-on-overlay);
  box-shadow: 0 0 0 1px var(--color-overlay-edge), var(--shadow-sm);
  cursor: pointer;
  line-height: 1;
  transition: background var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}
.field-media__crop { top: calc(80px - 1.75rem - 4px); }
.field-media__crop:hover {
  background: var(--color-primary);
  color: var(--color-on-primary);
  box-shadow: 0 0 0 1px var(--color-overlay-edge-strong), var(--shadow-md);
  transform: scale(1.08);
}
.field-media__remove:hover {
  background: var(--color-danger-solid);
  color: var(--color-on-danger);
  box-shadow: 0 0 0 1px var(--color-overlay-edge-strong), var(--shadow-md);
  transform: scale(1.08);
}
.field-media__crop:focus-visible,
.field-media__remove:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .field-media__crop,
  .field-media__remove { transition: none; }
  .field-media__crop:hover,
  .field-media__remove:hover { transform: none; }
}

.field-media__empty { color: var(--color-text-muted); font-size: var(--text-sm); margin: 0; }
</style>
