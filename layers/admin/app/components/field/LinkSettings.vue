<script setup lang="ts">
import { computed, ref } from 'vue'
import UiButton from '../ui/Button.vue'
import UiButtonGroup from '../ui/ButtonGroup.vue'
import UiTextInput from '../ui/TextInput.vue'
import UiPopover from '../ui/Popover.vue'
import type { LinkType } from '#kestrel/types/kestrel'

const TYPE_KEYS: Record<LinkType, string> = {
  internal: 'field.link.type_internal',
  external: 'field.link.type_url',
  email: 'field.link.type_email',
  tel: 'field.link.type_phone',
}

const props = defineProps<{
  currentType: LinkType
  allowed: LinkType[]
  disabled?: boolean
  active?: boolean
}>()

const typeModel = defineModel<LinkType>('type', { required: true })
const hash = defineModel<string>('hash', { required: true })
const label = defineModel<string>('label', { required: true })

const { t } = useT()
const open = ref(false)
const typeOptions = computed(() => props.allowed.map((ltype) => ({ value: ltype, label: t(TYPE_KEYS[ltype]) })))
</script>

<template>
  <UiPopover v-model:open="open" side="bottom" align="end">
    <template #trigger>
      <UiButton
        type="button"
        variant="ghost"
        size="sm"
        icon="settings"
        class="ui-link-settings__trigger"
        :class="{ 'ui-link-settings__trigger--active': active }"
        :disabled="disabled"
        :aria-label="t('field.link.settings')"
      />
    </template>

    <UiButtonGroup
      v-if="allowed.length > 1"
      v-model="typeModel"
      :options="typeOptions"
      :disabled="disabled"
      :aria-label="t('field.link.link_type')"
    />

    <UiTextInput
      v-if="currentType === 'internal'"
      v-model="hash"
      :disabled="disabled"
      :placeholder="t('field.link.hash_placeholder')"
      :aria-label="t('field.link.hash_placeholder')"
    />

    <UiTextInput
      v-model="label"
      :disabled="disabled"
      :placeholder="t('field.link.label_placeholder')"
      :aria-label="t('field.link.label_placeholder')"
    />
  </UiPopover>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-link-settings__trigger {
  position: relative;

  &.ui-button {
    @include mixins.control-icon;
  }

  .ui-combobox__anchor & {
    min-block-size: var(--control-icon-size, 1.5rem);
    min-inline-size: var(--control-icon-size, 1.5rem);
  }
}
.ui-link-settings__trigger--active::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
}
</style>
