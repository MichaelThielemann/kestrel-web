<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { UploadItem } from '../composables/useMediaUpload'
import type { UploadSummary } from '../utils/upload-queue'
import { uploadRunView } from '../utils/upload-state'

const props = defineProps<{
  items: readonly UploadItem[]
  summary: UploadSummary
  canRetry: (item: UploadItem) => boolean
  previewFor?: (id: string) => string | undefined
  followUp?: string
}>()
const emit = defineEmits<{ retry: [id: string]; retryFailed: []; cancel: []; close: [] }>()
const { t } = useT()

const run = computed(() => uploadRunView(props.summary, t))
const countText = computed(() => run.value.countText)

const overall = computed(() => {
  if (!props.items.length) return 0
  const partial = props.items.reduce((sum, item) => (item.status === 'uploading' || item.status === 'processing' ? sum + item.progress / 100 : sum), 0)
  return ((props.summary.settled + partial) / props.items.length) * 100
})

const retryableFailed = computed(() => props.items.some((item) => item.status === 'failed' && props.canRetry(item)))
const actions = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)

function retryRow(id: string) {
  emit('retry', id)
  void nextTick(() => {
    const rows = list.value?.querySelectorAll<HTMLElement>(':scope > li') ?? []
    Array.from(rows).find((row) => row.dataset.uploadId === id)?.focus()
  })
}
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

const endAction = computed(() => props.summary.finished
  ? { text: t('common.close'), label: t('media.upload.closePanel'), run: () => emit('close') }
  : { text: t('common.cancel'), label: t('media.upload.cancelAll'), run: () => act('cancel') })

watch(() => props.summary.finished, () => { void nextTick(refocus) })

const sessionMessage = computed(() => props.items.find((item) => item.status === 'failed' && item.code === 'UNAUTHENTICATED')?.message)
</script>

<template>
  <section class="media-upload-panel" :aria-label="t('media.upload.panelLabel')">
    <header class="media-upload-panel__head">
      <div class="media-upload-panel__summary" aria-live="polite">
        <p class="media-upload-panel__count">
          <span v-if="summary.finished" class="media-upload-panel__finished" :class="`media-upload-panel__finished--${run.finished.tone}`">
            <KestrelUiIcon :name="run.finished.icon" :size="16" /> {{ run.finished.text }}
          </span>
          <span>{{ countText }}</span>
        </p>
        <p v-if="followUp" class="media-upload-panel__follow-up">{{ followUp }}</p>
      </div>
      <div ref="actions" class="media-upload-panel__actions">
        <KestrelUiButton v-if="retryableFailed" size="sm" variant="secondary" icon="rotate-ccw" @click="act('retryFailed')">{{ t('media.upload.retryFailed') }}</KestrelUiButton>
        <KestrelUiButton size="sm" variant="secondary" :aria-label="endAction.label" @click="endAction.run">{{ endAction.text }}</KestrelUiButton>
      </div>
      <KestrelUiProgress class="media-upload-panel__overall" :value="overall" :label="t('media.upload.overall')" :value-text="countText" :tone="run.barTone" />
      <p v-if="sessionMessage" class="media-upload-panel__alert" role="alert">
        <KestrelUiIcon name="triangle-alert" :size="16" /> {{ sessionMessage }}
        <a href="/admin/login" target="_blank" rel="noopener">{{ t('media.upload.signInNewTab') }}</a>
      </p>
    </header>
    <ul ref="list" class="media-upload-panel__list" tabindex="0" :aria-label="t('media.upload.panelLabel')">
      <li v-for="item in items" :key="item.id" :data-upload-id="item.id" tabindex="-1">
        <KestrelMediaUploadRow :item="item" :preview="previewFor?.(item.id)" :retryable="canRetry(item)" @retry="retryRow" />
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.media-upload-panel__summary {
  flex: 1 1 14rem;
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

.media-upload-panel__finished {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.media-upload-panel__finished--success .ui-icon {
  color: var(--color-success);
}

.media-upload-panel__finished--danger .ui-icon {
  color: var(--color-danger);
}

.media-upload-panel__finished--muted .ui-icon {
  color: var(--color-text-muted);
}

.media-upload-panel__follow-up {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.media-upload-panel__actions {
  display: flex;
  flex: 0 1 auto;
  margin-inline-start: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.media-upload-panel__overall,
.media-upload-panel__alert {
  flex-basis: 100%;
}

.media-upload-panel__alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-danger);

  a {
    color: inherit;
    font-weight: var(--weight-medium);
  }
}

.media-upload-panel__list {
  list-style: none;
  margin: 0;
  padding: 0 var(--space-4);
  max-height: min(16rem, 30vh);
  overflow-y: auto;

  @include mixins.focus-ring;

  > li {
    @include mixins.focus-ring;
  }

  > li + li {
    border-top: 1px solid var(--color-border);
  }
}
</style>
