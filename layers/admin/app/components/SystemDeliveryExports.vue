<script setup lang="ts">
import type { StaleStatus } from '#kestrel-admin/types/api'
import { exportLines, type IndexFiles } from '../utils/export-messages'

const props = defineProps<{ exports: StaleStatus['exports'], files: IndexFiles }>()

const { t, lang } = useT()
const dateFmt = computed(() => new Intl.DateTimeFormat(lang.value, { dateStyle: 'medium', timeStyle: 'medium' }))
const listFmt = computed(() => new Intl.ListFormat(lang.value, { style: 'long', type: 'conjunction' }))
const lines = computed(() => exportLines(t, props.exports, { time: (ms) => dateFmt.value.format(new Date(ms)), list: (items) => listFmt.value.format(items) }, props.files))
</script>

<template>
  <div class="delivery-exports">
    <h3 class="delivery-exports__title">{{ t('delivery.indexExportsTitle') }}</h3>
    <ul class="delivery-exports__list">
      <li v-for="line in lines" :key="line.id" class="delivery-exports__row" :data-tone="line.tone">
        <KestrelUiIcon :name="line.icon" :size="16" />
        <div class="delivery-exports__body">
          <span class="delivery-exports__name">{{ line.name }}</span>
          <span class="delivery-exports__text">{{ line.text }}</span>
          <span v-if="line.error" class="delivery-exports__error">{{ line.error }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style lang="scss">
.delivery-exports {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  &__title {
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-sm);

    > svg {
      flex: none;
      margin-top: 0.125rem;
      color: var(--color-text-muted);
    }

    &[data-tone='current'] > svg {
      color: var(--color-success);
    }

    &[data-tone='failed'] > svg {
      color: var(--color-danger);
    }

    &[data-tone='skipped'] > svg {
      color: var(--color-warning);
    }
  }

  &__body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  &__name {
    font-family: var(--font-mono, monospace);
    color: var(--color-text);
  }

  &__text {
    color: var(--color-text-muted);
  }

  &__error {
    color: var(--color-text);
    overflow-wrap: anywhere;
  }
}
</style>
