<script setup lang="ts">

import type { DeliveryEntry } from '#kestrel-admin/types/api'

const props = defineProps<{
  dirty: boolean
  saving?: boolean

  hasStatus?: boolean

  status?: string

  pageLike?: boolean

  delivery?: DeliveryEntry[] | null

  deliveryLoading?: boolean

  locale?: string
}>()
const { t, lang } = useT()

type Tone = 'amber' | 'green' | 'blue' | 'neutral'

const save = computed<{ tone: Tone; word: string; detail: string }>(() => {
  if (props.saving) return { tone: 'amber', word: t('editorStatus.word.saving'), detail: t('editorStatus.detail.saving') }
  if (props.dirty) return { tone: 'amber', word: t('editorStatus.word.unsaved'), detail: t('editorStatus.detail.unsaved') }
  if (props.hasStatus && props.status === 'draft') return { tone: 'blue', word: t('editorStatus.word.draft'), detail: t('editorStatus.detail.draft') }
  if (props.hasStatus && props.status === 'finished') return { tone: 'neutral', word: t('editorStatus.word.finished'), detail: t('editorStatus.detail.finished') }
  if (props.hasStatus && props.status === 'published') return { tone: 'green', word: t('editorStatus.word.published'), detail: t('editorStatus.detail.published') }
  return { tone: 'green', word: t('editorStatus.word.saved'), detail: t('editorStatus.detail.saved') }
})

type LiveTone = 'green' | 'red' | 'blue' | 'neutral'

const publishedAtLabel = computed(() => {
  const entry = deliveryEntry.value
  if (!entry?.publishedAt) return ''
  const d = new Date(entry.publishedAt)
  if (Number.isNaN(d.getTime())) return ''
  return t('editorStatus.live.updatedAt', { time: d.toLocaleString(lang.value) })
})

const deliveryEntry = computed<DeliveryEntry | null>(() => props.delivery?.find((d) => d.locale === props.locale) ?? null)

const live = computed<{ tone: LiveTone; word: string; detail: string; when?: string; error?: string } | null>(() => {
  if (props.pageLike !== true) return null
  const entry = deliveryEntry.value
  if (!entry) {
    return props.deliveryLoading
      ? { tone: 'neutral', word: t('editorStatus.word.loading'), detail: t('editorStatus.live.unknown') }
      : { tone: 'neutral', word: t('editorStatus.word.unknown'), detail: t('editorStatus.live.unknown') }
  }
  if (entry.state === 'error')
    return { tone: 'red', word: t('editorStatus.word.error'), detail: t('editorStatus.live.error'), error: entry.error ?? '' }
  if (entry.state === 'draft')
    return { tone: 'blue', word: t('editorStatus.word.notLive'), detail: t('editorStatus.live.draft') }
  return {
    tone: 'green',
    word: t('editorStatus.word.live'),
    detail: entry.path ? t('editorStatus.live.livePath', { path: entry.path }) : t('editorStatus.live.liveLocal'),
    when: publishedAtLabel.value,
  }
})
</script>

<template>
  <span class="editor-status-group">

    <span class="editor-status-sr" role="status" aria-live="polite">{{ save.detail }}</span>

    <KestrelUiTooltip side="bottom">

      <span class="editor-status" tabindex="0" :data-tone="save.tone" :aria-label="`${save.word} — ${save.detail}`">
        <span class="editor-status__dot" aria-hidden="true" />
        <span class="editor-status__word">{{ save.word }}</span>
      </span>
      <template #content>
        <span class="editor-status-tip">
          <strong class="editor-status-tip__detail">{{ save.detail }}</strong>
        </span>
      </template>
    </KestrelUiTooltip>

    <KestrelUiTooltip v-if="live" side="bottom">
      <span class="editor-status-live" tabindex="0" :data-tone="live.tone" :aria-label="`${live.word} — ${live.detail}`">
        <span class="editor-status-live__dot" aria-hidden="true" />
        <span class="editor-status-live__word">{{ live.word }}</span>
      </span>
      <template #content>
        <span class="editor-status-tip">
          <strong class="editor-status-tip__detail">{{ live.detail }}</strong>
          <span v-if="live.when" class="editor-status-tip__when">{{ live.when }}</span>
          <span v-if="live.tone === 'red' && live.error" class="editor-status-tip__err">{{ live.error }}</span>
        </span>
      </template>
    </KestrelUiTooltip>
  </span>
</template>

<style scoped lang="scss">
.editor-status-group {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.editor-status-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.editor-status,
.editor-status-live {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: help;

  &__dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: var(--radius-full);
    background: var(--_tone, var(--color-text-subtle));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--_tone, transparent) 22%, transparent);
    flex: none;
  }
  &__word {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  &[data-tone='amber'] {
    --_tone: var(--color-warning);
  }
  &[data-tone='green'] {
    --_tone: var(--color-success);
  }
  &[data-tone='blue'] {
    --_tone: var(--color-primary);
  }
  &[data-tone='red'] {
    --_tone: var(--color-danger);
  }
  &[data-tone='neutral'] {
    --_tone: var(--color-text-subtle);
  }
  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
}
</style>

<style lang="scss">
.editor-status-tip {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  &__when {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }
  &__err {
    color: var(--color-danger);
    font-size: var(--text-xs);
    word-break: break-word;
  }
}
</style>
