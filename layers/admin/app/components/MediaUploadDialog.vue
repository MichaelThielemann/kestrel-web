<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Provenance, ProvenanceOrigin } from '#kestrel-admin/types/api'
import type { PendingUpload } from '../utils/dnd'
import { displayFolderPath } from '../utils/library'
import { PROVENANCE_ORIGINS } from '../utils/provenance'

const props = defineProps<{ open: boolean; uploads: PendingUpload[]; folder: string; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ confirm: [Provenance]; 'update:open': [boolean] }>()

const { t } = useT()

const origin = ref<ProvenanceOrigin>('human')
const tool = ref('')
const model = ref('')
watch(() => props.open, (o) => { if (o) { origin.value = 'human'; tool.value = ''; model.value = '' } })

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
    :title="t('media.upload.title')"
    :description="t('media.upload.desc', { count: uploads.length, folder: displayFolderPath(folder) })"
    @update:open="(v) => emit('update:open', v)"
  >
    <ul class="media-upload__list">
      <li v-for="(u, i) in uploads" :key="i">
        {{ u.file.name }}<span v-if="u.folder !== folder"> — {{ displayFolderPath(u.folder) }}</span>
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
      <KestrelUiButton variant="primary" :disabled="busy || !uploads.length" @click="confirm">{{ t('mediaToolbar.upload') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.media-upload__list {
  list-style: none;
  margin: 0 0 var(--space-3);
  padding: 0;
  max-height: 12rem;
  overflow: auto;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
