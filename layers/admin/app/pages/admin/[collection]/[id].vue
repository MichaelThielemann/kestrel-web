<script setup lang="ts">
import { resolveLocalized } from '#kestrel-admin/utils/localized'
import { contentLocales, findCollection } from '#kestrel-admin/utils/collections'
import type { EditorExpose } from '#kestrel-admin/utils/editor-expose'
import type { BatchDeleteReport } from '#kestrel-admin/utils/collection-ops'
import { deleteRecord, deleteTranslation, discardRecord, leaveEditor, previewDeleteRecord } from '#kestrel-admin/actions/editor'
import type { ActionDeps, NavigatePort } from '#kestrel-admin/actions/types'

definePageMeta({ layout: 'admin', middleware: 'admin-auth', key: (route) => route.fullPath })

const route = useRoute()
const router = useRouter()
const collection = route.params.collection as string
const id = route.params.id as string

const localeParam = computed(() => (typeof route.query.locale === 'string' ? route.query.locale.trim() || undefined : undefined))

const listPath = computed(() => `/admin/${collection}${localeParam.value ? `?locale=${localeParam.value}` : ''}`)

const { t, lang } = useT()
const toast = useToast()
const api = useApi()
const { can } = useAuth()

const deps: ActionDeps = { api, t, toast }
const navigate: NavigatePort = async (d) => (d.kind === 'path' ? navigateTo(d.to) : router.replace({ query: d.query }))

const def = findCollection(collection) ?? null
const singular = computed(() => resolveLocalized(def?.label?.singular, lang.value) ?? collection)
const plural = computed(() => resolveLocalized(def?.label?.plural, lang.value) ?? collection)

const newTitle = computed(() => resolveLocalized(def?.label?.new, lang.value) ?? t('editor.newRecord', { collection: singular.value }))

const EDITOR_FORM_ID = 'record-editor'
const editorRef = ref<EditorExpose | null>(null)
const saving = computed(() => editorRef.value?.saving ?? false)

const recordName = computed(() => editorRef.value?.recordTitle?.trim() || editorRef.value?.primaryTitle?.trim() || '')
const hasRecordTitle = computed(() => id !== 'new' && recordName.value !== '')
const heading = computed(() => (id === 'new' ? newTitle.value : hasRecordTitle.value ? recordName.value : t('editor.untitled')))

const translationNote = computed(() =>
  editorRef.value?.missingTranslation && editorRef.value.primaryTitle
    ? t('editor.translationOf', { title: editorRef.value.primaryTitle, loc: (editorRef.value.primaryLocale || '').toUpperCase() })
    : '',
)

const published = computed(() => editorRef.value?.savedStatus === 'published')
const canPublish = computed(() => (editorRef.value?.hasStatus ?? false) && id !== 'new')

const publishBlocked = computed(() => editorRef.value?.missingTranslation === true)

const skipGuard = ref(false)
const bypassGuard = () => { skipGuard.value = true }

const deleting = ref(false)
const deleteError = ref<string | null>(null)
const deleteOpen = ref(false)
const deleteReport = ref<BatchDeleteReport | null>(null)
const deleteOps = {
  setBusy: (on: boolean) => { deleting.value = on },
  busy: () => deleting.value,
  setError: (message: string | null) => { deleteError.value = message },
}

const canDeleteTranslation = computed(() => def?.translatable === true && def?.mode === 'multi' && id !== 'new')
const currentLocale = computed(() => editorRef.value?.locale ?? localeParam.value ?? contentLocales.primary)
const otherTranslations = computed(() =>
  contentLocales.locales.filter((locale) => locale !== currentLocale.value && editorRef.value?.translations?.[locale] === true),
)
const translationScope = computed(() =>
  canDeleteTranslation.value
    ? { locale: currentLocale.value, others: otherTranslations.value, defaultLocale: contentLocales.primary }
    : undefined,
)

function onSaved(record: unknown) {
  if (id !== 'new') return
  const newId = (record as { id?: string } | null)?.id
  if (!newId) return
  return runAction(leaveEditor, {
    navigate,
    bypassGuard,
    to: `/admin/${collection}/${newId}${localeParam.value ? `?locale=${localeParam.value}` : ''}`,
  })
}

useUnsavedGuard(() => editorRef.value?.dirty ?? false, () => t('editor.discardConfirm'), () => skipGuard.value)

function toList() {
  return runAction(discardRecord, { t, confirm: confirmDiscard, navigate, to: listPath.value })
}

async function onDelete() {
  const r = await runAction(previewDeleteRecord, { deps, collection, ids: [id], allowed: can('pages.manage') })
  deleteReport.value = r.ok ? (r.result ?? null) : null
  deleteOpen.value = true
}

async function confirmDelete() {
  const r = await runAction(deleteRecord, {
    deps, collection, ids: [id], confirmed: true, ops: deleteOps, navigate, bypassGuard, to: listPath.value,
  })
  if (r.ok) deleteOpen.value = false
}

async function confirmDeleteTranslation() {
  const others = otherTranslations.value
  const target = others.includes(contentLocales.primary) ? contentLocales.primary : others[0]
  if (!target) return
  const r = await runAction(deleteTranslation, {
    deps, collection, id, locale: currentLocale.value, confirmed: true, ops: deleteOps, navigate, bypassGuard,
    to: `/admin/${collection}/${id}?locale=${target}`,
  })
  if (r.ok) deleteOpen.value = false
}
</script>

<template>
  <section class="record">
    <div class="record__head">
      <NuxtLink :to="listPath" class="record__back">
        <KestrelUiIcon name="arrow-left" :size="16" />
        <span>{{ t('editor.back', { collection: plural }) }}</span>
      </NuxtLink>
      <h1 class="record__title" :class="{ 'record__title--generic': !hasRecordTitle }">{{ heading }}</h1>
      <p v-if="translationNote" class="record__translation-note">{{ translationNote }}</p>
      <div class="record__actions">
        <KestrelUiButton type="button" variant="ghost" size="sm" icon="undo" :disabled="saving || !editorRef?.canUndo" :title="t('history.undo')" :aria-label="t('history.undo')" @click="editorRef?.undo()" />
        <KestrelUiButton type="button" variant="ghost" size="sm" icon="redo" :disabled="saving || !editorRef?.canRedo" :title="t('history.redo')" :aria-label="t('history.redo')" @click="editorRef?.redo()" />
        <KestrelUiButton type="button" variant="secondary" size="sm" icon="x" :disabled="saving" @click="toList">{{ t('common.cancel') }}</KestrelUiButton>
        <KestrelUiButton v-if="id !== 'new'" variant="danger" size="sm" icon="trash" :loading="deleting" @click="onDelete">{{ t('common.delete') }}</KestrelUiButton>
        <KestrelUiButton type="submit" :form="EDITOR_FORM_ID" variant="primary" size="sm" icon="check" :loading="saving">{{ t('common.save') }}</KestrelUiButton>

        <KestrelUiButton v-if="canPublish && !published" type="button" variant="secondary" size="sm" icon="upload" :disabled="saving || publishBlocked" :title="publishBlocked ? t('editor.publishNeedsTranslation') : undefined" @click="editorRef?.setStatus('published')">{{ t('common.publish') }}</KestrelUiButton>
        <KestrelUiButton v-else-if="canPublish" type="button" variant="secondary" size="sm" icon="undo" :disabled="saving" @click="editorRef?.setStatus('draft')">{{ t('common.unpublish') }}</KestrelUiButton>
        <KestrelEditorStatus
          class="record__ampel"
          :dirty="editorRef?.dirty ?? false"
          :saving="saving"
          :has-status="editorRef?.hasStatus ?? false"
          :status="editorRef?.savedStatus"
          :page-like="(editorRef?.pageLike ?? false) && id !== 'new'"
          :delivery="editorRef?.delivery ?? null"
          :delivery-loading="editorRef?.deliveryLoading ?? false"
          :locale="editorRef?.locale"
        />
      </div>
    </div>
    <KestrelCollectionEditor :id="id" ref="editorRef" :collection="collection" :form-id="EDITOR_FORM_ID" :locale-param="localeParam" :actions="false" @saved="onSaved" />
    <KestrelCollectionDeleteDialog
      :open="deleteOpen"
      :report="deleteReport"
      :busy="deleting"
      :error="deleteError"
      :translation="translationScope"
      @update:open="deleteOpen = $event"
      @confirm="confirmDelete"
      @confirm-translation="confirmDeleteTranslation"
    />
  </section>
</template>

<style lang="scss">
.record {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  overflow: hidden;

  &__back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex: 0 0 auto;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;

    &:hover {
      color: var(--color-text);
    }
    span {
      text-transform: capitalize;
    }
  }

  &__head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
  }

  &__ampel {
    margin-inline-start: var(--space-1);
    padding-inline-start: var(--space-3);
    border-inline-start: 1px solid var(--color-border);
  }

  &__translation-note {
    margin: 0;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  &__title {
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);

    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &--generic {
      text-transform: capitalize;
    }
  }
}
</style>
