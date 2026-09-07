<script setup lang="ts">
import { ref, computed } from 'vue'
import type { IconName } from '../../utils/icons'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    type?: 'text' | 'password' | 'email' | 'url' | 'search' | 'tel' | 'datetime-local'
    placeholder?: string
    disabled?: boolean

    reveal?: boolean

    slim?: boolean
    icon?: IconName
  }>(),
  { type: 'text', disabled: false, reveal: false, slim: false },
)

const model = defineModel<string | null>()
const { t } = useT()

const revealable = computed(() => props.type === 'password' || props.reveal)
const revealed = ref(false)

const inputType = computed(() => (revealable.value && revealed.value ? 'text' : props.type))
</script>

<template>
  <div class="ui-input-wrap">
    <KestrelUiIcon v-if="icon" :name="icon" :size="15" class="ui-input__icon" />
    <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- id/label land via v-bind="$attrs" from the wrapping UiField, invisible to static analysis -->
    <input
      v-model="model"
      :type="inputType"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ui-input"
      :class="{ 'ui-input--revealable': revealable, 'ui-input--slim': slim, 'ui-input--icon': icon }"
      v-bind="$attrs"
    >
    <button
      v-if="revealable"
      type="button"
      class="ui-input__reveal"
      :disabled="disabled"
      :aria-label="revealed ? t('input.hidePassword') : t('input.showPassword')"
      @click="revealed = !revealed"
    >
      <KestrelUiIcon :name="revealed ? 'eye-off' : 'eye'" size="1.125rem" />
    </button>
  </div>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-input-wrap {
  position: relative;
  display: block;
  width: 100%;
}

.ui-input {
  @include mixins.input-base;
  width: 100%;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &--slim {
    @include mixins.input-slim;
  }

  &--revealable {
    padding-inline-end: 2.5rem;
  }

  &--icon {
    padding-inline-start: calc(var(--space-4) + 1.25rem);
  }
}

.ui-input__icon {
  position: absolute;
  top: 50%;
  left: var(--space-2);
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}

.ui-input__reveal {
  @include mixins.focus-ring;
  position: absolute;
  inset-block: 1px;
  inset-inline-end: 1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  min-inline-size: 2.25rem;
  padding-inline: var(--space-2);
  border: 0;
  border-start-end-radius: var(--radius-md);
  border-end-end-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--color-text);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}
</style>
