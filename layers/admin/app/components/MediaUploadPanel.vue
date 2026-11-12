<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { UploadItem } from '../composables/useMediaUpload'
import type { UploadSummary } from '../utils/upload-queue'

const props = defineProps<{
  items: readonly UploadItem[]
  summary: UploadSummary
  canRetry: (item: UploadItem) => boolean
  previewFor?: (id: string) => string | undefined
  followUp?: string
}>()
const emit = defineEmits<{ retry: [id: string]; retryFailed: []; cancel: []; close: [] }>()
const { t } = useT()

const countText = computed(() => {
  const { done, total, failed } = props.summary
  return failed ? t('media.upload.summaryFailed', { done, total, failed }) : t('media.upload.summary', { done, total })
})

const overall = computed(() => {
  if (!props.items.length) return 0
  const partial = props.items.reduce((sum, item) => (item.status === 'uploading' || item.status === 'processing' ? sum + item.progress / 100 : sum), 0)
  return ((props.summary.settled + partial) / props.items.length) * 100
})

const overallTone = computed(() => (props.summary.finished && props.summary.done === props.summary.total ? 'success' : 'default'))
const retryableFailed = computed(() => props.items.some((item) => item.status === 'failed' && props.canRetry(item)))
const actions = ref<HTMLElement | null>(null)
let keepFocus = false

function refocus() {
  if (!keepFocus || !import.meta.client) return
  const active = document.activeElement
  if (actions.value?.contains(active)) return
  if (active && active !== document.body) { keepFocus = false; return }
  actions.value?.querySelector<HTMLElement>('button')?.focus()
}

function act(name: 'retryFailed' | 'cancel') {
  keepFocus = true
  if (name === 'retryFailed') emit('retryFailed')
  else emit('cancel')
  void nextTick(refocus)
}

watch(() => props.summary.finished, () => { void nextTick(refocus) })

const sessionMessage = computed(() => props.items.find((item) => item.status === 'failed' && item.code === 'UNAUTHENTICATED')?.message)
</script>

<template>
  <section class="media-upload-panel" :aria-label="t('media.upload.panelLabel')">
    <header class="media-upload-panel__head">
      <div class="media-upload-panel__summary" aria-live="polite">
        <p class="media-upload-panel__count">
          <span v-if="summary.finished" class="media-upload-panel__done">
            <KestrelUiIcon name="circle-check" :size="16" /> {{ t('media.upload.done') }}
          </span>
          <span>{{ countText }}</span>
        </p>
        <p v-if="followUp" class="media-upload-panel__follow-up">{{ followUp }}</p>
      </div>
      <div ref="actions" class="media-upload-panel__actions">
        <KestrelUiButton v-if="retryableFailed" size="sm" variant="secondary" icon="rotate-ccw" @click="act('retryFailed')">{{ t('media.upload.retryFailed') }}</KestrelUiButton>
        <KestrelUiButton v-if="!summary.finished" size="sm" variant="secondary" @click="act('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton v-else size="sm" variant="secondary" @click="emit('close')">{{ t('common.close') }}</KestrelUiButton>
      </div>
      <KestrelUiProgress class="media-upload-panel__overall" :value="overall" :label="t('media.upload.overall')" :value-text="countText" :tone="overallTone" />
      <p v-if="sessionMessage" class="media-upload-panel__alert" role="alert">
        <KestrelUiIcon name="triangle-alert" :size="16" /> {{ sessionMessage }}
      </p>
    </header>
    <ul class="media-upload-panel__list" tabindex="0" :aria-label="t('media.upload.panelLabel')">
      <li v-for="item in items" :key="item.id">
        <KestrelMediaUploadRow :item="item" :preview="previewFor?.(item.id)" :retryable="canRetry(item)" @retry="emit('retry', $event)" />
      </li>
    </ul>
  </section>
</template>

<style lang="scss" scoped>
@use '../assets/scss/mixins';

.media-upload-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.media-upload-panel__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.media-upload-panel__summary {
  min-width: 0;
}

.media-upload-panel__count {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.media-upload-panel__done {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);

  .ui-icon {
    color: var(--color-success);
  }
}

.media-upload-panel__follow-up {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.media-upload-panel__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.media-upload-panel__overall,
.media-upload-panel__alert {
  grid-column: 1 / -1;
}

.media-upload-panel__alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-danger);
}

.media-upload-panel__list {
  list-style: none;
  margin: 0;
  padding: 0 var(--space-4);
  max-height: min(16rem, 35vh);
  overflow-y: auto;

  @include mixins.focus-ring;

  > li + li {
    border-top: 1px solid var(--color-border);
  }
}
</style>
