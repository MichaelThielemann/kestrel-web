<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Provenance, ProvenanceOrigin } from '#kestrel-admin/types/api'
import type { PendingUpload } from '../utils/dnd'
import { displayFolderPath, humanizeSize } from '../utils/library'
import { PROVENANCE_ORIGINS } from '../utils/provenance'
import { exceedsUploadLimit } from '../utils/upload-limit'

const props = defineProps<{ open: boolean; uploads: PendingUpload[]; folder: string; maxBytes?: number | null; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ confirm: [Provenance]; 'update:open': [boolean] }>()

const { t } = useT()

const origin = ref<ProvenanceOrigin>('human')
const tool = ref('')
const model = ref('')
watch(() => props.open, (o) => { if (o) { origin.value = 'human'; tool.value = ''; model.value = '' } })

const rows = computed(() => props.uploads.map((u) => {
  const tooLarge = exceedsUploadLimit(u.file.size, props.maxBytes ?? null)
  return {
    upload: u,
    tooLarge,
    meta: u.folder === props.folder ? humanizeSize(u.file.size) : `${humanizeSize(u.file.size)} · ${displayFolderPath(u.folder)}`,
    message: tooLarge ? t('media.upload.tooLargeShort', { size: humanizeSize(u.file.size), limit: humanizeSize(props.maxBytes ?? 0) }) : undefined,
  }
}))
const sendable = computed(() => rows.value.filter((r) => !r.tooLarge).length)
const confirmLabel = computed(() => (sendable.value === 1 ? t('media.upload.confirmOne') : t('media.upload.confirmCount', { n: sendable.value })))

const originOptions = computed(() => PROVENANCE_ORIGINS.map((v) => ({ label: t(`media.provenance.${v}`), value: v })))
const originModel = computed<string | null>({
  get: () => origin.value,
  set: (v) => { if (v === 'human' || v === 'ai' || v === 'mixed') origin.value = v },
})

function confirm() {
  const p: Provenance = { origin: origin.value }
  if (tool.value.trim()) p.tool = tool.value.trim()
  if (model.value.trim()) p.model = model.value.trim()
  emit('confirm', p)
}
</script>

<template>
  <KestrelUiDialog
    :open="open"
    nested
    :title="t('media.upload.title')"
    :description="t('media.upload.desc', { count: uploads.length, folder: displayFolderPath(folder) })"
    @update:open="(v) => emit('update:open', v)"
  >
    <ul class="media-upload__list" tabindex="0" :aria-label="t('media.upload.title')">
      <li v-for="(row, i) in rows" :key="i">
        <KestrelUiProgressRow
          :title="row.upload.file.name"
          :meta="row.meta"
          :message="row.message"
          :tone="row.tooLarge ? 'danger' : 'default'"
          :status="row.tooLarge ? { text: t('media.upload.skipped'), icon: 'circle-x', tone: 'danger' } : undefined"
        />
      </li>
    </ul>
    <KestrelUiField :label="t('mediaViewer.originLabel')" :hint="t('media.upload.originHint')">
      <template #default="f">
        <KestrelUiSelect v-model="originModel" :options="originOptions" v-bind="f" />
      </template>
    </KestrelUiField>
    <template v-if="origin !== 'human'">
      <KestrelUiField :label="t('mediaViewer.tool')" :hint="t('mediaViewer.toolHint')">
        <template #default="f">
          <KestrelUiTextInput v-model="tool" v-bind="f" />
        </template>
      </KestrelUiField>
      <KestrelUiField :label="t('mediaViewer.model')">
        <template #default="f">
          <KestrelUiTextInput v-model="model" v-bind="f" />
        </template>
      </KestrelUiField>
    </template>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <template #footer>
      <KestrelUiButton :disabled="busy" @click="emit('update:open', false)">{{ t('common.cancel') }}</KestrelUiButton>
      <KestrelUiButton variant="primary" :disabled="busy || !sendable" @click="confirm">{{ confirmLabel }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.media-upload__list {
  list-style: none;
  margin: 0 0 var(--space-3);
  padding: 0;
  max-height: 14rem;
  overflow: auto;

  > li + li {
    border-top: 1px solid var(--color-border);
  }
}
</style>
