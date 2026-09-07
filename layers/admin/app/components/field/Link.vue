<script setup lang="ts">
import { computed } from 'vue'
import UiField from '../ui/Field.vue'
import UiTextInput from '../ui/TextInput.vue'
import UiIcon from '../ui/Icon.vue'
import LinkInternalPicker from './LinkInternalPicker.vue'
import LinkSettings from './LinkSettings.vue'
import { hasExtras, useLinkField } from '../../composables/useLinkField'
import type { FieldComponentProps } from '../../utils/field-component'
import type { FieldOf, LinkType, LinkValue } from '#kestrel/types/kestrel'

const ALL: LinkType[] = ['external', 'email', 'tel', 'internal']

const { t } = useT()
const props = defineProps<FieldComponentProps>()
const model = defineModel<LinkValue | null>()

const required = computed(() => !!props.field.required)
const allowed = computed<LinkType[]>(() =>
  props.field.type === 'link' ? ((props.field as FieldOf<'link'>).options?.types ?? ALL) : ALL,
)
const internalCollections = computed(() =>
  props.field.type === 'link' ? (props.field as FieldOf<'link'>).options?.collections : undefined,
)

const { currentType, typeModel, url, email, tel, label, collection, recordId, hash } = useLinkField(model, allowed)

const hasSettings = computed(() => hasExtras(model.value))
</script>

<template>
  <UiField :id="id" :label="name" :error="error" :required="required">
    <template #default="f">
      <div class="ui-link__row">
        <div v-if="currentType === 'external'" class="ui-link__text-wrap">
          <UiTextInput
            v-model="url"
            type="url"
            :disabled="disabled"
            :placeholder="t('field.link.url_placeholder')"
            v-bind="f"
          />
          <div class="ui-link__text-suffix">
            <button
              v-if="url"
              type="button"
              class="ui-link__text-clear"
              :disabled="disabled"
              :aria-label="t('field.link.clear')"
              @click="url = ''"
            ><UiIcon name="x" :size="14" /></button>
            <LinkSettings
              v-model:type="typeModel"
              v-model:hash="hash"
              v-model:label="label"
              :current-type="currentType"
              :allowed="allowed"
              :disabled="disabled"
              :active="hasSettings"
            />
          </div>
        </div>
        <div v-else-if="currentType === 'email'" class="ui-link__text-wrap">
          <UiTextInput
            v-model="email"
            type="email"
            :disabled="disabled"
            v-bind="f"
          />
          <div class="ui-link__text-suffix">
            <button
              v-if="email"
              type="button"
              class="ui-link__text-clear"
              :disabled="disabled"
              :aria-label="t('field.link.clear')"
              @click="email = ''"
            ><UiIcon name="x" :size="14" /></button>
            <LinkSettings
              v-model:type="typeModel"
              v-model:hash="hash"
              v-model:label="label"
              :current-type="currentType"
              :allowed="allowed"
              :disabled="disabled"
              :active="hasSettings"
            />
          </div>
        </div>
        <div v-else-if="currentType === 'tel'" class="ui-link__text-wrap">
          <UiTextInput
            v-model="tel"
            type="tel"
            :disabled="disabled"
            v-bind="f"
          />
          <div class="ui-link__text-suffix">
            <button
              v-if="tel"
              type="button"
              class="ui-link__text-clear"
              :disabled="disabled"
              :aria-label="t('field.link.clear')"
              @click="tel = ''"
            ><UiIcon name="x" :size="14" /></button>
            <LinkSettings
              v-model:type="typeModel"
              v-model:hash="hash"
              v-model:label="label"
              :current-type="currentType"
              :allowed="allowed"
              :disabled="disabled"
              :active="hasSettings"
            />
          </div>
        </div>
        <LinkInternalPicker
          v-else
          v-model:collection="collection"
          v-model:record-id="recordId"
          :collections="internalCollections"
          :locale="locale"
          :disabled="disabled"
          :input-id="f.id"
          :invalid="f['aria-invalid'] === 'true'"
          :describedby="f['aria-describedby']"
          :required="f.required"
        >
          <template #suffix>
            <LinkSettings
              v-model:type="typeModel"
              v-model:hash="hash"
              v-model:label="label"
              :current-type="currentType"
              :allowed="allowed"
              :disabled="disabled"
              :active="hasSettings"
            />
          </template>
        </LinkInternalPicker>
      </div>
    </template>
  </UiField>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-link__row {
  display: flex;
}
.ui-link__row > * {
  flex: 1 1 auto;
  min-inline-size: 0;
}
.ui-link__text-wrap {
  position: relative;
}
.ui-link__text-wrap .ui-input {
  padding-inline-end: 3rem;
}
.ui-link__text-suffix {
  position: absolute;
  inset-block: 1px;
  inset-inline-end: 1px;
  display: inline-flex;
  align-items: center;
  gap: 0;
}
.ui-link__text-clear {
  @include mixins.control-icon;
}
</style>
