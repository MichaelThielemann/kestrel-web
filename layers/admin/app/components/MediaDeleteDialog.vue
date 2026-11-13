<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ReferenceTo } from '#kestrel-admin/types/api'
import type { HeldUndo } from '../composables/useMediaUndo'
import { itemCountLabel, type RemovalDialogState } from '../utils/media-removal'

const props = defineProps<{ state: RemovalDialogState | null; busy?: boolean; error?: string | null; conflict?: ReferenceTo[] | null; undo?: HeldUndo | null }>()
const emit = defineEmits<{ confirm: [boolean]; cancel: []; undo: [] }>()

const { t } = useT()
const PREVIEW = 4
const REFS = 3
const HINT_KEYS = { delete: 'media.deleteHint', trash: 'media.remove.trashHint', purge: 'media.remove.purgeHint', empty: 'media.remove.emptyHint' } as const

const mode = computed(() => props.state?.mode ?? 'delete')
const what = computed(() => (props.state ? itemCountLabel(t, props.state.files, props.state.folders) : ''))
const title = computed(() => {
  if (props.state?.finished) return t('media.remove.title.partial')
  return t(`media.remove.title.${mode.value}`, { what: what.value })
})
const confirmLabel = computed(() => t(`media.remove.confirm.${mode.value}`, { what: what.value }))
const preview = computed(() => props.state?.entries.slice(0, PREVIEW) ?? [])
const more = computed(() => Math.max(0, (props.state?.entries.length ?? 0) - PREVIEW))
const uniquePages = (refs: ReferenceTo[]) => refs.filter((r, i) => refs.findIndex((o) => o.type === r.type && o.id === r.id) === i)
const inUse = computed(() => (props.state?.finished ? [] : (props.state?.entries.filter((e) => e.refs.length) ?? []).map((e) => ({ ...e, refs: uniquePages(e.refs) }))))
const problems = computed(() => [
  ...(props.state?.failures ?? []).map((p) => ({ ...p, kept: false })),
  ...(props.state?.skipped ?? []).map((p) => ({ ...p, kept: true })),
])
const progress = computed(() => props.state?.progress ?? null)
const stoppable = computed(() => props.busy === true && props.state?.stoppable === true)
const cancelLabel = computed(() => (stoppable.value ? t('media.remove.stop') : props.state?.finished ? t('media.remove.close') : t('common.cancel')))
const held = computed(() => (props.state?.finished ? (props.undo ?? null) : null))

const recursive = ref(false)
watch(() => props.state === null, (closed) => { if (closed) recursive.value = false })

const cancelButton = ref<{ focus: () => void } | null>(null)
function onOpenAutoFocus(e: Event) {
  e.preventDefault()
  cancelButton.value?.focus()
}
</script>

<template>
  <KestrelUiDialog :open="state !== null" nested :title="title" @update:open="(v) => { if (!v) emit('cancel') }" @open-auto-focus="onOpenAutoFocus">
    <template v-if="state">
      <ul v-if="preview.length && !state.finished" class="media-remove__preview">
        <li v-for="entry in preview" :key="entry.id" class="media-remove__entry">
          <KestrelMediaThumb class="media-remove__thumb" :path="entry.path" :content-type="entry.contentType" alt="" />
          <span class="media-remove__name">{{ entry.name }}</span>
        </li>
      </ul>
      <p v-if="more && !state.finished" class="media-remove__muted">{{ t('media.remove.more', { n: more }) }}</p>
      <div v-if="inUse.length" class="media-remove__in-use">
        <p class="media-remove__heading">{{ t('media.remove.inUse') }}</p>
        <div v-for="entry in inUse" :key="entry.id" class="media-remove__refs">
          <span class="media-remove__name">{{ entry.name }}</span>
          <KestrelReferrerList :refs="entry.refs.slice(0, REFS)" />
          <p v-if="entry.refs.length > REFS" class="media-remove__muted">{{ t('refs.referencedByMore', { n: entry.refs.length - REFS }) }}</p>
        </div>
      </div>
      <KestrelUiAlert v-if="state.unverified && !state.finished" variant="warning">{{ t('media.remove.unverified') }}</KestrelUiAlert>
      <p v-if="!state.finished" class="media-remove__muted">{{ t(HINT_KEYS[state.mode]) }}</p>
      <label v-if="state.mode === 'delete' && state.nonEmptyFolders && !state.finished" class="media-remove__recursive">
        <KestrelUiCheckbox v-model="recursive" :disabled="busy" />
        <span>{{ t('media.deleteRecursive') }}</span>
      </label>
      <KestrelUiProgress v-if="progress && busy" class="media-remove__progress" :value="(progress.done / progress.total) * 100"
        :label="t('media.remove.progress')" :value-text="t('media.remove.progressText', { done: progress.done, total: progress.total })" />
      <div v-if="problems.length" class="media-remove__problems">
        <p class="media-remove__heading">{{ t('media.remove.notRemoved') }}</p>
        <KestrelUiProgressRow v-for="p in problems" :key="p.id" :title="p.name" :message="p.reason" :tone="p.kept ? 'default' : 'danger'"
          :status="p.kept ? { text: t('media.remove.kept'), icon: 'info', tone: 'muted' } : { text: t('media.remove.failed'), icon: 'circle-x', tone: 'danger' }" />
      </div>
      <p v-if="state.cancelled" class="media-remove__muted">{{ t('media.remove.cancelled') }}</p>
      <p v-if="held" class="media-remove__moved">{{ held.message }}</p>
      <div v-if="conflict?.length" class="media-remove__in-use">
        <p class="media-remove__heading">{{ t('refs.conflictAfterPrecheck') }}</p>
        <KestrelReferrerList :refs="conflict" />
      </div>
      <KestrelUiAlert v-else-if="error && !problems.length" variant="error">{{ error }}</KestrelUiAlert>
    </template>
    <template #footer>
      <KestrelUiButton v-if="held?.undo" variant="ghost" icon="rotate-ccw" data-test="remove-undo" @click="emit('undo')">{{ t('media.trash.undo') }}</KestrelUiButton>
      <KestrelUiButton ref="cancelButton" variant="ghost" data-test="remove-cancel" :disabled="busy && !stoppable" @click="emit('cancel')">{{ cancelLabel }}</KestrelUiButton>
      <KestrelUiButton v-if="!state?.finished" variant="danger" :loading="busy" :disabled="busy" @click="emit('confirm', recursive)">{{ confirmLabel }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.media-remove__preview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6rem, 8rem));
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  padding: 0;
  list-style: none;
}
.media-remove__entry {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.media-remove__thumb {
  aspect-ratio: 1;
  width: 100%;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}
.media-remove__name {
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
.media-remove__muted {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.media-remove__heading {
  margin: 0 0 var(--space-1);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.media-remove__in-use {
  margin-top: var(--space-3);
  font-size: var(--text-sm);

  ul { margin: var(--space-1) 0 0; padding-inline-start: var(--space-4); }
}
.media-remove__refs + .media-remove__refs { margin-top: var(--space-2); }
.media-remove__recursive {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.media-remove__progress,
.media-remove__problems,
.media-remove__moved { margin-top: var(--space-3); }
.media-remove__moved { margin-bottom: 0; font-size: var(--text-sm); }
</style>
