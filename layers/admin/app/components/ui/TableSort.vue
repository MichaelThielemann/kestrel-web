<script setup lang="ts">
import { computed } from 'vue'
import { sortDirection } from '../../utils/list-query'
import UiIcon from './Icon.vue'

const props = defineProps<{ field: string; sort: string }>()
const emit = defineEmits<{ sort: [field: string] }>()

const direction = computed(() => sortDirection(props.sort, props.field))
</script>

<template>
  <button type="button" class="ui-table-sort" @click="emit('sort', field)">
    <span><slot /></span>
    <UiIcon
      v-if="direction"
      :name="direction === 'asc' ? 'chevron-up' : 'chevron-down'"
      :size="13"
      class="ui-table-sort__icon"
      aria-hidden="true"
    />
  </button>
</template>

<style lang="scss">
@use '../../assets/scss/mixins';

.ui-table-sort {
  @include mixins.focus-ring;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-weight: var(--weight-medium);
  color: inherit;
  cursor: pointer;

  &:hover {
    color: var(--color-text);
  }
}
</style>
