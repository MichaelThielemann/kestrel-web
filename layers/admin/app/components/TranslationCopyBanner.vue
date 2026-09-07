<script setup lang="ts">
const props = defineProps<{ locale: string; sources: string[]; defaultSource: string }>()
const emit = defineEmits<{ copy: [source: string] }>()
const { t } = useT()

const selectedSource = ref(props.defaultSource)
watch(() => props.defaultSource, (v) => { selectedSource.value = v })

const sourceOptions = computed(() => props.sources.map((loc) => ({ label: loc.toUpperCase(), value: loc })))
const sourceId = 'translation-copy-source'
</script>

<template>
  <KestrelUiAlert variant="info" class="translation-copy-banner">
    <div class="translation-copy-banner__row">
      <p class="translation-copy-banner__text">{{ t('editor.untranslatedNotice', { locale: locale.toUpperCase() }) }}</p>
      <div class="translation-copy-banner__actions">
        <label v-if="sources.length > 1" class="translation-copy-banner__source" :for="sourceId">
          <span class="translation-copy-banner__source-label">{{ t('editor.copySource') }}</span>
          <KestrelUiSelect :id="sourceId" v-model="selectedSource" slim :options="sourceOptions" />
        </label>
        <KestrelUiButton type="button" variant="secondary" size="sm" @click="emit('copy', selectedSource)">
          {{ t('editor.copyFrom', { locale: selectedSource.toUpperCase() }) }}
        </KestrelUiButton>
      </div>
    </div>
  </KestrelUiAlert>
</template>

<style lang="scss">
.translation-copy-banner {
  &__row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  &__text {
    margin: 0;
    flex: 1 1 auto;
  }
  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  &__source {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  &__source-label {
    color: var(--color-text-muted);
  }
}
</style>
