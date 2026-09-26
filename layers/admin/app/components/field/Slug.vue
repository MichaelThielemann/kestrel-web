<script setup lang="ts">
import { computed } from 'vue'
import { slugify } from '#kestrel-admin/utils/kestrel'
import { fieldIs } from '#kestrel-admin/types/kestrel'
import { RESERVED_PAGE_SEGMENTS } from '#kestrel-core/mount-path'
import type { FieldComponentProps } from '../../utils/field-component'
import { editorFormContextKey } from '../../utils/editor-form-context'
import { pathPreviewKey } from '../../composables/usePathPreview'

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

const paths = inject(pathPreviewKey, null)
const preview = computed(() => paths?.preview.value ?? null)
const notesId = useId()

const localePrefix = computed(() => (props.locale === primary.value && !prefixPrimary.value ? '/' : `/${props.locale}/`))
const prefix = computed(() => {
  const path = preview.value?.path ?? ''
  const slug = model.value ?? ''
  return slug !== '' && path.endsWith(`/${slug}`) ? path.slice(0, path.length - slug.length) : localePrefix.value
})

const rootPlaceholder = computed(() => (model.value ? undefined : t('field.slug.rootPlaceholder')))
const rootHint = computed(() => (model.value ? undefined : t('pageSettings.slugHomeHint')))

const topLevel = computed(() => {
  const parent = form?.values.parent
  return typeof parent !== 'string' || parent === ''
})
const reserved = computed(() => topLevel.value && typeof model.value === 'string' && (RESERVED_PAGE_SEGMENTS as readonly string[]).includes(model.value))
const taken = computed(() => {
  const conflict = preview.value?.conflict
  return conflict ? t('field.slug.taken', { path: conflict.path, locale: conflict.locale.toUpperCase(), label: conflict.label }) : undefined
})
const displayError = computed(() => (reserved.value ? t('field.slug.reserved', { slug: model.value ?? '' }) : (props.error ?? taken.value)))

const notes = computed(() => {
  const current = preview.value
  if (!current) return []
  const out = current.shadows.map((shadow) => t('field.slug.shadows', { path: shadow.path, label: shadow.label }))
  if (current.exposesParentSlug) out.push(t('field.slug.exposesParent', { label: current.exposesParentSlug.label }))
  const unreachable = paths?.unreachable.value
  if (unreachable) out.push(t('field.slug.unreachable', { reason: unreachable }))
  return out
})

function describedBy(base: string | undefined): string | undefined {
  return [base, notes.value.length > 0 ? notesId : undefined].filter(Boolean).join(' ') || undefined
}

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
  <KestrelUiField :id="id" :label="name" :hint="rootHint" :error="displayError">
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
          :aria-describedby="describedBy(f['aria-describedby'])"
          :disabled="disabled"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
      <ul v-if="notes.length" :id="notesId" class="field-slug__notes">
        <li v-for="note in notes" :key="note">{{ note }}</li>
      </ul>
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
.field-slug__notes {
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: var(--space-1);
  font-size: var(--text-sm); color: var(--color-warning-text);
}
</style>
