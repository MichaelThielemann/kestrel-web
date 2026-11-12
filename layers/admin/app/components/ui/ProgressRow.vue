<script setup lang="ts">
import type { ProgressRowProgress, ProgressRowStatus, ProgressRowTone } from '../../utils/progress-row'

withDefaults(defineProps<{
  title: string
  meta?: string
  status?: ProgressRowStatus
  progress?: ProgressRowProgress
  message?: string
  tone?: ProgressRowTone
}>(), { tone: 'default' })
</script>

<template>
  <div class="ui-progress-row" :class="`ui-progress-row--${tone}`">
    <div class="ui-progress-row__body">
      <span v-if="$slots.leading" class="ui-progress-row__leading"><slot name="leading" /></span>
      <div class="ui-progress-row__main">
        <div class="ui-progress-row__line">
          <KestrelUiTooltip>
            <span class="ui-progress-row__title">{{ title }}</span>
            <template #content>{{ title }}</template>
          </KestrelUiTooltip>
          <span v-if="meta" class="ui-progress-row__meta">{{ meta }}</span>
        </div>
        <KestrelUiProgress
          v-if="progress"
          size="sm"
          :value="progress.value"
          :label="progress.label"
          :value-text="progress.valueText"
          :tone="progress.tone"
        />
        <p v-if="message" class="ui-progress-row__message">{{ message }}</p>
      </div>
      <span
        v-if="$slots.status || status"
        class="ui-progress-row__status"
        :class="status?.tone ? `ui-progress-row__status--${status.tone}` : undefined"
      >
        <slot name="status">
          <template v-if="status">
            <KestrelUiSpinner v-if="status.busy" class="ui-progress-row__status-icon" />
            <KestrelUiIcon v-else-if="status.icon" :name="status.icon" :size="16" class="ui-progress-row__status-icon" />
            <span>{{ status.text }}</span>
          </template>
        </slot>
      </span>
      <span v-if="$slots.actions" class="ui-progress-row__actions"><slot name="actions" /></span>
    </div>
  </div>
</template>

<style lang="scss">
.ui-progress-row {
  container-type: inline-size;
  min-width: 0;
  padding-block: var(--space-2);
  font-size: var(--text-sm);
}

.ui-progress-row__body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  grid-template-areas: 'leading main status actions';
  align-items: center;
  row-gap: var(--space-1);
}

.ui-progress-row__leading {
  grid-area: leading;
  margin-inline-end: var(--space-3);
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text-muted);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.ui-progress-row__main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.ui-progress-row__line {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}

.ui-progress-row__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-progress-row__meta {
  flex: none;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.ui-progress-row__message {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
}

.ui-progress-row--muted .ui-progress-row__title {
  color: var(--color-text-muted);
}

.ui-progress-row--danger .ui-progress-row__message {
  color: var(--color-danger);
}

.ui-progress-row__status {
  grid-area: status;
  margin-inline-start: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ui-progress-row__status--muted {
  color: var(--color-text-muted);
}

.ui-progress-row__status--success .ui-progress-row__status-icon {
  color: var(--color-success);
}

.ui-progress-row__status--danger {
  color: var(--color-danger);
}

.ui-progress-row__actions {
  grid-area: actions;
  margin-inline-start: var(--space-2);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

@container (max-width: 28rem) {
  .ui-progress-row__body {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'leading main actions'
      'leading status actions';
  }

  .ui-progress-row__status {
    justify-self: start;
    margin-inline-start: 0;
  }
}
</style>
