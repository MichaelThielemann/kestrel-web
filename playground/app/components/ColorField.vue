<script setup lang="ts">
import { computed } from 'vue'
import type { FieldComponentProps } from '#kestrel-admin/utils/field-component'

const props = defineProps<FieldComponentProps>()
const model = defineModel<string | null>()

const required = computed(() => props.field.required === true)
const swatch = computed(() => (/^#[0-9a-f]{6}$/.test(model.value ?? '') ? model.value ?? undefined : undefined))
</script>

<template>
  <KestrelUiField :id="id" :label="name" :error="error" :required="required">
    <template #default="f">
      <span class="color-field">
        <span class="color-field__swatch" :style="{ background: swatch }" aria-hidden="true" />
        <KestrelUiTextInput v-model="model" :disabled="disabled" placeholder="#2266cc" v-bind="f" />
      </span>
    </template>
  </KestrelUiField>
</template>

<style lang="scss">
.admin .color-field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-inline-size: 0;

  &__swatch {
    flex: none;
    inline-size: 1.75rem;
    block-size: 1.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
  }
}
</style>
