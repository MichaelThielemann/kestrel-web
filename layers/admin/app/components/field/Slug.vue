<script setup lang="ts">
import { computed } from 'vue'
import { slugify } from '#kestrel-admin/utils/kestrel'
import { fieldIs } from '#kestrel-admin/types/kestrel'
import type { FieldComponentProps } from '../../utils/field-component'
import { editorFormContextKey } from '../../utils/editor-form-context'

const props = defineProps<FieldComponentProps>()
const model = defineModel<string | null>()

const { t } = useT()
const { primary, prefixPrimary } = useContentLocales()
const form = inject(editorFormContextKey, null)

const auto = computed(() => {
  const from = fromField.value
  if (!from || !form || !model.value) return false
  return Boolean(form.following[props.name]) && slugify(String(form.values[from] ?? '')) === model.value
})

const opts = computed(() => {
  const field = props.field
  return fieldIs(field, 'slug') ? field.options : undefined
})
const fromField = computed(() => opts.value?.from)

const prefix = computed(() => (props.locale === primary.value && !prefixPrimary.value ? '/' : `/${props.locale}/`))

const rootPlaceholder = computed(() => (model.value ? undefined : t('field.slug.rootPlaceholder')))
const rootHint = computed(() => (model.value ? undefined : t('pageSettings.slugHomeHint')))

function onBlur() {
  const cur = model.value ?? ''
  if (!cur.trim()) return
  const s = slugify(cur)
  if (s && s !== cur) model.value = s
}

function onFocus(event: FocusEvent) {
  if (auto.value && event.target instanceof HTMLInputElement) event.target.select()
}
</script>

<template>
  <KestrelUiField :id="id" :label="name" :hint="rootHint" :error="error ?? undefined">
    <template #default="f">
      <div class="field-slug">
        <span class="field-slug__prefix">{{ prefix }}</span>
        <KestrelUiTextInput
          :id="f.id"
          v-model="model"
          class="field-slug__input"
          :class="{ 'field-slug__input--auto': auto }"
          type="text"
          :placeholder="rootPlaceholder"
          :aria-invalid="f['aria-invalid']"
          :aria-describedby="f['aria-describedby']"
          :disabled="disabled"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
    </template>
  </KestrelUiField>
</template>

<style lang="scss" scoped>
.field-slug {
  display: flex; align-items: stretch; min-width: 0;
  border: 1px solid var(--color-control-border, var(--color-border)); border-radius: var(--radius-md);
  background: var(--color-surface); overflow: hidden;
}
.field-slug__prefix {
  display: inline-flex; align-items: center; padding: var(--space-2) var(--space-4);
  background: var(--color-surface-2); color: var(--color-text-muted);
  border-right: 1px solid var(--color-border); font-size: var(--text-sm); white-space: nowrap;
}
.field-slug :deep(.ui-input-wrap) { flex: 1 1 auto; min-width: 0; width: auto; }
.field-slug :deep(.field-slug__input) {
  width: 100%; padding: var(--space-2) var(--space-4);
  border: 0; border-radius: 0; background: transparent; color: var(--color-text); font: inherit; font-size: var(--text-base);
  &:focus, &:focus-visible { outline: none; }
  &.field-slug__input--auto { color: var(--color-text-muted); }
}
.field-slug:focus-within { border-color: var(--color-primary); }
</style>
