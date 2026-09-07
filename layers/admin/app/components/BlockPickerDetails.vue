<script setup lang="ts">
import { computed } from 'vue'
import type { SerializedBlock } from '#kestrel/types/kestrel'
import { blockDetails } from '../utils/block-details'

const props = defineProps<{ type: SerializedBlock; lang: string }>()

const { t } = useT()

const details = computed(() => blockDetails(props.type, props.lang))

function sizeLabel(size: { width: number; height?: number }): string {
  return size.height !== undefined ? `${size.width}×${size.height}` : `${size.width}px`
}
</script>

<template>
  <div class="block-picker-details">
    <p v-if="details.description" class="block-picker-details__desc">{{ details.description }}</p>

    <section class="block-picker-details__section">
      <h3 class="block-picker-details__heading">{{ t('blocks.pickerDetailsSlots') }}</h3>
      <p v-if="!details.slots.length" class="block-picker-details__empty">{{ t('blocks.pickerDetailsNoSlots') }}</p>
      <ul v-else class="block-picker-details__slots">
        <li v-for="slot in details.slots" :key="slot">{{ slot }}</li>
      </ul>
    </section>

    <section v-if="details.fields.length" class="block-picker-details__section">
      <h3 class="block-picker-details__heading">{{ t('blocks.pickerDetailsFields') }}</h3>
      <table class="block-picker-details__table">
        <thead>
          <tr>
            <th scope="col">{{ t('blocks.pickerDetailsFieldName') }}</th>
            <th scope="col">{{ t('blocks.pickerDetailsFieldType') }}</th>
            <th scope="col">{{ t('blocks.pickerDetailsFieldRequired') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in details.fields" :key="field.key">
            <td>{{ field.label }}</td>
            <td>{{ field.type }}</td>
            <td>{{ field.required ? t('blocks.pickerDetailsFieldRequired') : '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="details.imageSizes.length" class="block-picker-details__section">
      <h3 class="block-picker-details__heading">{{ t('blocks.pickerDetailsImageSizes') }}</h3>
      <ul class="block-picker-details__slots">
        <li v-for="size in details.imageSizes" :key="size.name">{{ size.name }} ({{ sizeLabel(size) }})</li>
      </ul>
    </section>

    <p v-if="details.source" class="block-picker-details__source">{{ t('blocks.pickerDetailsSource', { path: details.source }) }}</p>
  </div>
</template>

<style lang="scss">
.block-picker-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--text-sm);
}
.block-picker-details__desc {
  color: var(--color-text);
}
.block-picker-details__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.block-picker-details__heading {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
}
.block-picker-details__empty {
  color: var(--color-text-muted);
}
.block-picker-details__slots {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.block-picker-details__table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }
}
.block-picker-details__source {
  margin: 0;
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  word-break: break-all;
}
</style>
