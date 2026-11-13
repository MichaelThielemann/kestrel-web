<script setup lang="ts">
import { onUnmounted } from 'vue'

const toasts = useToast()
const { t } = useT()
const { target: portalTarget } = useAdminPortal()

function onFocusOut(id: number, e: FocusEvent) {
  const toast = e.currentTarget
  const next = e.relatedTarget
  if (toast instanceof HTMLElement && next instanceof Node && toast.contains(next)) return
  toasts.release(id, 'focus')
}

onUnmounted(() => toasts.clear())
</script>

<template>
  <Teleport :to="portalTarget">
    <div class="admin-portal">
      <div class="ui-toasts__live" aria-live="polite" role="status">
        <template v-for="toast in toasts.items" :key="`p-${toast.id}`">
          <div v-if="toast.type !== 'error'">{{ toast.message }}</div>
        </template>
      </div>
      <div class="ui-toasts__live" aria-live="assertive" role="alert">
        <template v-for="toast in toasts.items" :key="`a-${toast.id}`">
          <div v-if="toast.type === 'error'">{{ toast.message }}</div>
        </template>
      </div>
      <div class="ui-toasts" role="region" :aria-label="t('toast.region')">
        <TransitionGroup name="ui-toast">
          <div
            v-for="toast in toasts.items"
            :key="toast.id"
            class="ui-toast"
            :class="`ui-toast--${toast.type}`"
            @mouseenter="toasts.hold(toast.id, 'hover')"
            @mouseleave="toasts.release(toast.id, 'hover')"
            @focusin="toasts.hold(toast.id, 'focus')"
            @focusout="onFocusOut(toast.id, $event)"
          >
            <span class="ui-toast__msg">{{ toast.message }}</span>
            <KestrelUiButton v-if="toast.action" variant="ghost" size="sm" class="ui-toast__action" @click="toasts.runAction(toast.id)">{{ toast.action.label }}</KestrelUiButton>
            <button type="button" class="ui-toast__close" :aria-label="t('toast.dismiss')" @click="toasts.dismiss(toast.id)">
              <KestrelUiIcon name="x" size="0.875rem" />
            </button>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-toasts__live { @include mixins.sr-only; }

.ui-toasts {
  position: fixed;
  inset-block-end: var(--space-5);
  inset-inline-end: var(--space-5);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: min(22rem, calc(100vw - var(--space-8)));
  pointer-events: none;
}

.ui-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-inline-start: 4px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: var(--text-sm);

  &--success { border-inline-start-color: var(--color-success); }
  &--error { border-inline-start-color: var(--color-danger); }
  &--info { border-inline-start-color: var(--color-primary); }

  &__msg { flex: 1 1 auto; min-width: 0; }

  &__action {
    flex-shrink: 0;
    min-height: 1.5rem;
  }

  &__close {
    @include mixins.focus-ring;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    min-height: 1.5rem;
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);

    &:hover { background: var(--color-hover); color: var(--color-text); }
  }
}

.ui-toast-enter-active,
.ui-toast-leave-active {
  transition:
    opacity var(--motion-base) var(--ease-standard),
    transform var(--motion-base) var(--ease-standard);
}
.ui-toast-enter-from,
.ui-toast-leave-to {
  opacity: 0;
  transform: translateY(var(--space-3));
}
</style>
