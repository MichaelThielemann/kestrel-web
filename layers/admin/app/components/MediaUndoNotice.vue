<script setup lang="ts">
import type { UndoNotice } from '../composables/useMediaUndo'

defineProps<{ notice: UndoNotice | null }>()
const emit = defineEmits<{ dismiss: [] }>()
const { t } = useT()
</script>

<template>
  <div class="media-undo" :class="notice ? `media-undo--${notice.type}` : 'media-undo--idle'">
    <p class="media-undo__message" role="status" aria-live="polite">{{ notice?.message ?? '' }}</p>
    <template v-if="notice">
      <KestrelUiButton v-if="notice.undo" size="sm" variant="ghost" icon="rotate-ccw" data-test="media-undo" @click="notice.undo()">{{ t('media.trash.undo') }}</KestrelUiButton>
      <KestrelUiButton size="sm" variant="ghost" icon="x" :aria-label="t('toast.dismiss')" @click="emit('dismiss')" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '../assets/scss/mixins';

.media-undo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-inline-start: 4px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--text-sm);

  &--success { border-inline-start-color: var(--color-success); }
  &--error { border-inline-start-color: var(--color-danger); }
  &--info { border-inline-start-color: var(--color-primary); }

  &--idle {
    position: absolute;
    padding: 0;
    border: 0;

    .media-undo__message { @include mixins.sr-only; }
  }

  &__message {
    flex: 1 1 12rem;
    min-width: 0;
    margin: 0;
  }
}
</style>
