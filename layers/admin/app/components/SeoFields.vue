<script setup lang="ts">
import { computed } from 'vue'
import { localePath } from '#kestrel/utils/kestrel'
import type { PageSeo } from '#kestrel/types/api'

const props = defineProps<{
  value: PageSeo
  pageTitle?: string

  slug?: string
  locale: string
  disabled?: boolean
}>()
const emit = defineEmits<{ update: [seo: PageSeo] }>()
const { t } = useT()
const { primary, prefixPrimary } = useContentLocales()

const TITLE_MAX = 60
const DESC_MAX = 160

function patch(next: Partial<PageSeo>) {
  emit('update', { ...props.value, ...next })
}

const previewTitle = computed(() => props.value.title?.trim() || props.pageTitle?.trim() || t('seo.untitled'))
const previewDesc = computed(() => props.value.description?.trim() || t('seo.noDescription'))

const siteUrl = computed(() => String(useRuntimeConfig().public.siteUrl ?? '').replace(/\/+$/, ''))
const previewUrl = computed(() => {
  const slug = props.slug?.trim() ?? ''
  const path = localePath(slug ? `/${slug}` : '/', props.locale, primary, prefixPrimary)
  return `${siteUrl.value || (import.meta.client ? window.location.host : '')}${path}`
})

const titleLen = computed(() => (props.value.title ?? '').length)
const descLen = computed(() => (props.value.description ?? '').length)
</script>

<template>
  <div class="seo-fields">
    <KestrelSectionLabel class="seo-fields__section-label" :label="t('seo.sectionLabel')" :hint="t('seo.sectionHint')" />

    <div class="seo-preview" aria-hidden="true">
      <div class="seo-preview__url">{{ previewUrl }}</div>
      <div class="seo-preview__title">{{ previewTitle }}</div>
      <div class="seo-preview__desc">{{ previewDesc }}</div>
    </div>

    <KestrelUiField class="seo-fields__title" :label="t('seo.metaTitle')" :hint="`${titleLen}/${TITLE_MAX}`">
      <template #default="f">
        <KestrelUiTextInput
          :model-value="value.title ?? ''"
          :placeholder="pageTitle"
          :disabled="disabled"
          v-bind="f"
          @update:model-value="(v) => patch({ title: v ?? '' })"
        />
      </template>
    </KestrelUiField>

    <KestrelUiField class="seo-fields__desc" :label="t('seo.metaDescription')" :hint="`${descLen}/${DESC_MAX}`">
      <template #default="f">
        <KestrelUiTextarea
          :model-value="value.description ?? ''"
          :rows="3"
          :disabled="disabled"
          v-bind="f"
          @update:model-value="(v) => patch({ description: v ?? '' })"
        />
      </template>
    </KestrelUiField>

    <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- native wrapping label around a custom UiCheckbox; no `for`/`id` pair needed, invisible to static analysis -->
    <label class="seo-fields__noindex">
      <KestrelUiCheckbox
        :model-value="!!value.noindex"
        :disabled="disabled"
        @update:model-value="(v) => patch({ noindex: v })"
      />
      <span>{{ t('seo.noindexLabel') }}</span>
    </label>

    <slot />
  </div>
</template>

<style lang="scss">
.seo-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__section-label {
    justify-content: flex-end;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  &__noindex {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    cursor: pointer;
  }
}

.seo-preview {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);

  &__url {
    font-size: var(--text-xs, 0.75rem);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &__title {
    margin-top: var(--space-1);
    font-size: var(--text-lg);
    line-height: 1.3;
    color: var(--color-link, #1a0dab);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
  }
  &__desc {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}
</style>
