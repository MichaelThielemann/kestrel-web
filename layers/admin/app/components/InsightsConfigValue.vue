<script setup lang="ts">
import { computed } from 'vue'
import type { InsightsConfigVariable } from '#kestrel-admin/types/api'
import { configDefaultText, configValueText, isConfigRedacted } from '#kestrel-admin/utils/insights-format'

const COPY_MIN_LENGTH = 24

const props = withDefaults(defineProps<{ variable: InsightsConfigVariable, field?: 'value' | 'default' }>(), { field: 'value' })

const { t } = useT()
const toast = useToast()

const redacted = computed(() => isConfigRedacted(props.variable))
const text = computed(() => (props.field === 'default' ? configDefaultText(props.variable) : configValueText(props.variable)))
const copyable = computed(() => text.value !== null && text.value.length >= COPY_MIN_LENGTH)

async function copy(value: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText !== 'function') {
    toast.error(t('insights.valueCopyFailed'))
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    toast.success(t('insights.valueCopied'))
  }
  catch {
    toast.error(t('insights.valueCopyFailed'))
  }
}

function onCopy(): void {
  const value = text.value
  if (value !== null) void copy(value)
}
</script>

<template>
  <span v-if="redacted" class="insights-value insights-value--redacted">
    <KestrelUiIcon name="lock" :size="13" />
    <span>{{ t('insights.redacted') }}</span>
  </span>
  <span v-else-if="text === null" class="insights-value insights-value--none">—</span>
  <span v-else class="insights-value">
    <span class="insights-value__text" :title="text">{{ text }}</span>
    <KestrelUiButton
      v-if="copyable"
      variant="icon"
      size="sm"
      icon="copy"
      :aria-label="t('insights.copyValue', { path: variable.path })"
      @click="onCopy"
    />
  </span>
</template>

<style lang="scss">
.insights-value {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;

  &--redacted,
  &--none {
    color: var(--color-text-muted);
  }

  &__text {
    display: inline-block;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    vertical-align: bottom;
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
  }
}
</style>
