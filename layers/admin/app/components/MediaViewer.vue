<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { MediaItem, Provenance, ProvenanceOrigin } from '#kestrel-admin/types/api'
import { humanizeSize } from '../utils/library'
import { PROVENANCE_ORIGINS, provenanceOrigin } from '../utils/provenance'
import { changedMetaFields, type MediaMetaFields } from '../utils/media-meta'

export interface MediaMetaSave { locale: string; fields: MediaMetaFields }
export interface MediaViewerSave { provenance?: Provenance; meta?: MediaMetaSave }

const props = defineProps<{ open: boolean; file: MediaItem | null; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; save: [MediaViewerSave] }>()
const { t, lang } = useT()
const { locales, primary } = useContentLocales()
const api = useApi()

const isImage = computed(() => props.file?.contentType.startsWith('image/') ?? false)
const ext = computed(() => (props.file?.filename.split('.').pop() ?? '').toUpperCase())
const uploaded = computed(() => {
  const c = props.file?.createdAt
  return c ? new Date(c).toLocaleString(lang.value) : '—'
})
const dimensions = computed(() => {
  const f = props.file
  return f?.width != null && f?.height != null ? `${f.width} × ${f.height}` : '–'
})

const localeOptions = computed(() => locales.map((loc) => ({ label: loc.toUpperCase(), value: loc })))
const origin = ref<ProvenanceOrigin>('human')
const tool = ref('')
const model = ref('')
const fileOrigin = computed(() => provenanceOrigin(props.file?.provenance))
const selectableOrigins = computed<ProvenanceOrigin[]>(() => (fileOrigin.value === 'unknown' ? [...PROVENANCE_ORIGINS, 'unknown'] : PROVENANCE_ORIGINS))
const originOptions = computed(() => selectableOrigins.value.map((v) => ({ label: t(`media.provenance.${v}`), value: v })))
const fileTool = computed(() => props.file?.provenance?.tool ?? '')
const fileModel = computed(() => props.file?.provenance?.model ?? '')
const originModel = computed<string | null>({
  get: () => origin.value,
  set: (v) => { if (v === 'human' || v === 'ai' || v === 'mixed' || v === 'unknown') origin.value = v },
})
const provenanceDirty = computed(() => origin.value !== fileOrigin.value || tool.value !== fileTool.value || model.value !== fileModel.value)

const metaLocale = ref(primary)
const metaLoading = ref(false)

const loaded = ref<{ alt: string | null; title: string | null; description: string | null }>({ alt: null, title: null, description: null })
const alt = ref('')
const title = ref('')
const description = ref('')
const metaFields = computed(() => changedMetaFields(loaded.value, { alt: alt.value, title: title.value, description: description.value }))
const metaDirty = computed(() => Object.keys(metaFields.value).length > 0)
const altPlaceholder = computed(() => (loaded.value.alt == null ? t('mediaViewer.notTranslated') : ''))
const titlePlaceholder = computed(() => (loaded.value.title == null ? t('mediaViewer.notTranslated') : ''))
const descriptionPlaceholder = computed(() => (loaded.value.description == null ? t('mediaViewer.notTranslated') : ''))

async function loadMeta(locale: string) {
  const f = props.file
  if (!f) return

  if (locale === primary && f.id === lastLoadedFor) {
    loaded.value = { alt: f.alt, title: f.title, description: f.description }
    alt.value = f.alt ?? ''; title.value = f.title ?? ''; description.value = f.description ?? ''
    return
  }
  metaLoading.value = true
  try {
    const item = await api<MediaItem>(`/media/${encodeURIComponent(f.id)}`, { query: { locale } })
    loaded.value = { alt: item.alt, title: item.title, description: item.description }
    alt.value = item.alt ?? ''; title.value = item.title ?? ''; description.value = item.description ?? ''
  } finally {
    metaLoading.value = false
  }
}

let lastLoadedFor = ''

watch(() => props.open, (o) => {
  if (!o || !props.file) return
  origin.value = fileOrigin.value
  tool.value = fileTool.value
  model.value = fileModel.value
  metaLocale.value = primary
  lastLoadedFor = props.file.id
  loadMeta(primary)
}, { immediate: true })

watch(metaLocale, (loc) => { if (props.open) loadMeta(loc) })

const dirty = computed(() => provenanceDirty.value || metaDirty.value)
function save() {
  if (!dirty.value || props.busy) return
  const payload: MediaViewerSave = {}
  if (provenanceDirty.value) {
    const p: Provenance = { origin: origin.value }
    if (tool.value.trim()) p.tool = tool.value.trim()
    if (model.value.trim()) p.model = model.value.trim()
    payload.provenance = p
  }
  if (metaDirty.value) {
    payload.meta = { locale: metaLocale.value, fields: metaFields.value }
  }
  emit('save', payload)
}
</script>

<template>
  <KestrelUiDialog :open="open" size="xl" :title="file?.filename ?? ''" @update:open="(v) => emit('update:open', v)">
    <div v-if="file" class="media-viewer">
      <div class="media-viewer__preview">
        <img v-if="isImage" :src="mediaFileUrl(file.id)" :alt="file.alt ?? file.filename">
        <a v-else class="media-viewer__ext" :href="mediaFileUrl(file.id)" target="_blank" rel="noopener noreferrer">{{ ext }}</a>
      </div>
      <aside class="media-viewer__details">
        <dl class="media-viewer__info">
          <div><dt>{{ t('media.colType') }}</dt><dd>{{ file.contentType }}</dd></div>
          <div><dt>{{ t('media.colSize') }}</dt><dd>{{ humanizeSize(file.size) }}</dd></div>
          <div><dt>{{ t('media.colDimensions') }}</dt><dd>{{ dimensions }}</dd></div>
          <div><dt>{{ t('mediaViewer.folder') }}</dt><dd>{{ file.folder || '/' }}</dd></div>
          <div><dt>{{ t('mediaViewer.uploaded') }}</dt><dd>{{ uploaded }}</dd></div>
        </dl>

        <div class="media-viewer__meta">
          <div class="media-viewer__meta-head">
            <span class="media-viewer__meta-title">{{ t('mediaViewer.textsTitle') }}</span>
            <KestrelUiButtonGroup
              :model-value="metaLocale"
              :options="localeOptions"
              :disabled="metaLoading"
              :aria-label="t('localeBar.groupLabel')"
              @update:model-value="(v) => { if (typeof v === 'string' && v) metaLocale = v }"
            />
          </div>
          <KestrelUiField :label="t('mediaViewer.alt')" :hint="t('mediaViewer.altHint')">
            <template #default="f">
              <KestrelUiTextInput v-model="alt" :placeholder="altPlaceholder" :disabled="metaLoading" v-bind="f" @keydown.enter="save" />
            </template>
          </KestrelUiField>
          <KestrelUiField :label="t('mediaViewer.titleLabel')">
            <template #default="f">
              <KestrelUiTextInput v-model="title" :placeholder="titlePlaceholder" :disabled="metaLoading" v-bind="f" @keydown.enter="save" />
            </template>
          </KestrelUiField>
          <KestrelUiField :label="t('mediaViewer.descriptionLabel')">
            <template #default="f">
              <KestrelUiTextarea v-model="description" :placeholder="descriptionPlaceholder" :disabled="metaLoading" v-bind="f" />
            </template>
          </KestrelUiField>
        </div>

        <div class="media-viewer__provenance">
          <KestrelUiField :label="t('mediaViewer.originLabel')" :hint="t('mediaViewer.originHint')">
            <template #default="f">
              <KestrelUiSelect v-model="originModel" :options="originOptions" v-bind="f" />
            </template>
          </KestrelUiField>
          <KestrelUiField :label="t('mediaViewer.tool')" :hint="t('mediaViewer.toolHint')">
            <template #default="f">
              <KestrelUiTextInput v-model="tool" v-bind="f" @keydown.enter="save" />
            </template>
          </KestrelUiField>
          <KestrelUiField :label="t('mediaViewer.model')">
            <template #default="f">
              <KestrelUiTextInput v-model="model" v-bind="f" @keydown.enter="save" />
            </template>
          </KestrelUiField>
        </div>
        <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
      </aside>
    </div>
    <template v-if="file" #footer>
      <KestrelUiButton :disabled="busy" @click="emit('update:open', false)">{{ t('common.close') }}</KestrelUiButton>
      <KestrelUiButton variant="primary" :disabled="busy || !dirty" @click="save">{{ t('common.save') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.media-viewer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 18rem);
  gap: var(--space-4);
  align-items: start;
}
@media (max-width: 48rem) {
  .media-viewer { grid-template-columns: 1fr; }
}
.media-viewer__preview {
  display: grid;
  place-items: center;
  min-height: 16rem;
  max-height: 70svh;
  overflow: hidden;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.media-viewer__preview img { max-width: 100%; max-height: 70svh; object-fit: contain; }
.media-viewer__ext { padding: var(--space-7); font-size: var(--text-xl); font-weight: var(--weight-bold); color: var(--color-text-muted); }
.media-viewer__details { display: flex; flex-direction: column; gap: var(--space-4); }
.media-viewer__provenance,
.media-viewer__meta { display: flex; flex-direction: column; gap: var(--space-3); }
.media-viewer__meta-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.media-viewer__meta-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text-muted); }
.media-viewer__info { display: flex; flex-direction: column; gap: var(--space-2); margin: 0; }
.media-viewer__info > div { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--text-sm); }
.media-viewer__info dt { color: var(--color-text-muted); }
.media-viewer__info dd { margin: 0; text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
