<script setup lang="ts">
import { computed } from 'vue'
import type { BatchDeleteReport } from '../utils/collection-ops'

export interface TranslationScope {
  locale: string
  others: string[]
  defaultLocale: string
}

const props = defineProps<{
  open: boolean
  report: BatchDeleteReport | null
  busy?: boolean
  error?: string | null
  translation?: TranslationScope
}>()
const emit = defineEmits<{ confirm: []; confirmTranslation: []; 'update:open': [boolean] }>()

const { t } = useT()
const REF_PREVIEW = 5
const shownRefs = computed(() => props.report?.references.slice(0, REF_PREVIEW) ?? [])
const extraRefs = computed(() => Math.max(0, (props.report?.references.length ?? 0) - REF_PREVIEW))

const canDeleteTranslationOnly = computed(() => (props.translation?.others.length ?? 0) > 0)
const localeLabel = computed(() => props.translation?.locale.toUpperCase() ?? '')
const allLocales = computed(() => (props.translation ? [props.translation.locale, ...props.translation.others] : []))
const allLocalesLabel = computed(() => allLocales.value.map((locale) => locale.toUpperCase()).join(', '))
</script>

<template>
  <KestrelUiDialog :open="open" :title="t('common.delete')" @update:open="(v) => emit('update:open', v)">
    <template v-if="translation">
      <p v-if="canDeleteTranslationOnly">{{ t('list.deleteTranslationIntro', { locale: localeLabel, n: allLocales.length }) }}</p>
      <KestrelUiAlert v-else variant="warning">{{ t('list.deleteLastTranslationNote') }}</KestrelUiAlert>
    </template>
    <p v-if="report">{{ t('list.deleteSummary', { n: report.count }) }}</p>
    <div v-if="report && report.referencedCount > 0" class="collection-delete__warn">
      <p>{{ t('list.deleteReferrersWarn', { n: report.referencedCount }) }}</p>
      <p>{{ t('refs.referencedBy', { n: report.references.length }) }}</p>
      <KestrelReferrerList :refs="shownRefs" />
      <p v-if="extraRefs > 0" class="collection-delete__more">{{ t('refs.referencedByMore', { n: extraRefs }) }}</p>
    </div>

    <KestrelUiAlert v-if="report && report.checked === false" variant="warning" class="collection-delete__caution">
      {{ t('list.deleteRefsUnverified') }}
    </KestrelUiAlert>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <template #footer>
      <KestrelUiButton variant="ghost" :disabled="busy" @click="emit('update:open', false)">{{ t('common.cancel') }}</KestrelUiButton>
      <template v-if="canDeleteTranslationOnly">
        <KestrelUiButton variant="danger" :disabled="busy" @click="emit('confirmTranslation')">
          {{ t('list.deleteTranslationOnly', { locale: localeLabel }) }}
        </KestrelUiButton>
        <KestrelUiButton variant="danger-ghost" :disabled="busy" @click="emit('confirm')">
          {{ t('list.deleteAllLocales', { locales: allLocalesLabel }) }}
        </KestrelUiButton>
      </template>
      <KestrelUiButton v-else variant="danger" :disabled="busy" @click="emit('confirm')">{{ t('common.delete') }}</KestrelUiButton>
    </template>
  </KestrelUiDialog>
</template>

<style lang="scss" scoped>
.collection-delete__warn {
  margin-top: var(--space-3);
  color: var(--color-danger);
  font-size: var(--text-sm);

  ul {
    margin: var(--space-1) 0 0;
    padding-inline-start: var(--space-4);
  }
}
.collection-delete__more {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}
</style>
