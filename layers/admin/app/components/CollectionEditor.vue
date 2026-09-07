<script setup lang="ts">
import { contentLocales } from '#kestrel/utils/collections'
import { resolveCollectionEditor } from '../utils/editor-registry'
import { editorFormContextKey } from '../utils/editor-form-context'
import '../utils/register-builtin-editors'

const props = withDefaults(

  defineProps<{ collection: string; id: string; localeParam?: string; actions?: boolean; formId?: string }>(),
  { actions: true },
)
const emit = defineEmits<{ saved: [record: unknown]; cancel: [] }>()

const { t } = useT()
const f = useEditForm({ collection: props.collection, id: props.id, locale: props.localeParam })

const {
  formError, saving, submit, dirty, editorType, hasStatus, savedStatus, undo, redo, canUndo, canRedo, pageLike, delivery, deliveryLoading,
  locale, showCopyTranslation, copySourceLocales, copySourceDefault,
} = f

const renderable = computed(() =>
  Object.fromEntries(Object.entries(f.renderableFields.value).map(([name, field]) => [name, asFieldDef(field)])),
)

const heading = computed(() => recordTitle(renderable.value, f.values))

const pageFieldsBindings = computed(() => ({
  translatable: f.translatable.value, collection: props.collection, id: props.id, mode: f.mode.value,
  locale: f.locale.value, fields: renderable.value, fieldLayout: f.fieldLayout.value,
  values: f.values, errors: f.errors, rowErrors: f.rowErrors, disabled: f.saving.value, translations: f.translations.value,
}))

const pageFieldsHandlers = { update: f.setField }

const status = computed(() => (f.values.status as string | undefined) ?? '')

provide(editorFormContextKey, {
  values: f.values, errors: f.errors, blockErrors: f.blockErrors, following: f.following, formError: f.formError, setField: f.setField, locale: f.locale,
  saving: f.saving, mode: f.mode, translatable: f.translatable, blocksField: f.blocksField,
  blocksAllowed: f.blocksAllowed, renderable, undo: f.undo, redo: f.redo,
  pageFieldsBindings, pageFieldsHandlers,
  registerRevealError: f.registerRevealError,
})

defineExpose({
  dirty, saving, undo, redo, canUndo, canRedo, hasStatus, status, savedStatus, setStatus,
  recordTitle: heading,
  missingTranslation: f.missingTranslation, primaryTitle: f.primaryTitle, primaryLocale: contentLocales.primary,
  locale: f.locale, translations: f.translations,
  pageLike, delivery, deliveryLoading,
})

await f.ready

const bodyComponent = computed(() => resolveCollectionEditor(editorType.value))

async function onSave() {
  const r = await submit()
  if (r.ok) emit('saved', r.record)
}

async function setStatus(next: string) {
  const r = await f.setStatus(next)
  if (r.ok) emit('saved', r.record)
}

async function onCopyTranslation(source: string) {
  const confirmed = !dirty.value || confirm(t('editor.copyOverwriteConfirm', { locale: source.toUpperCase() }))
  if (confirmed) await f.copyTranslation(source, confirmed)
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>

  <form :id="formId" class="editor" novalidate @submit.prevent="onSave">
    <p v-if="formError" class="editor__error" role="alert">{{ formError }}</p>
    <KestrelTranslationCopyBanner
      v-if="showCopyTranslation"
      :locale="locale"
      :sources="copySourceLocales"
      :default-source="copySourceDefault"
      @copy="onCopyTranslation"
    />

    <component :is="bodyComponent" v-if="bodyComponent" />
    <KestrelEditorUnsupported v-else :editor="editorType" />

    <div v-if="actions" class="editor__actions">
      <KestrelUiButton type="submit" variant="primary" icon="check" :loading="saving">{{ t('common.save') }}</KestrelUiButton>
      <KestrelUiButton type="button" variant="secondary" icon="x" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</KestrelUiButton>
    </div>
  </form>
</template>

<style lang="scss">

.editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  flex: 1 1 auto;
  min-height: 0;

  &__error {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-sm);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
  &__actions {
    display: flex;
    gap: var(--space-3);
  }
}
</style>
