<script setup lang="ts">
import BlockRenderer from './BlockRenderer.vue'
import BlockBoundary from './BlockBoundary.vue'
import { blockComponents } from '#kestrel/blocks'
import type { BlockNode } from '../../../core/app/types/api'

const props = defineProps<{
  nodes: BlockNode[]
  editable?: boolean
  selectedId?: string | null

  unknownLabel?: (type: string) => string
  errorLabel?: string
}>()
const emit = defineEmits<{ select: [id: string] }>()

const slotsOf = (node: BlockNode): Record<string, BlockNode[]> => node.slots ?? {}
const select = (node: BlockNode): void => {
  if (props.editable && node.id) emit('select', node.id)
}
</script>

<template>
  <!-- eslint-disable vuejs-accessibility/no-static-element-interactions, vuejs-accessibility/click-events-have-key-events -->
  <div
    v-for="(node, i) in nodes"
    :key="node.id ?? i"
    class="block-marker"
    :class="{
      'block-marker--editable': editable,
      'block-marker--selected': editable && !!node.id && node.id === selectedId,
    }"
    :data-type="node.type"
    @click.stop="select(node)"
  >
    <BlockBoundary v-if="blockComponents[node.type]" :node-props="node.props" :editable="editable" :label="errorLabel ?? ''">
      <component :is="blockComponents[node.type]" v-bind="node.props">
        <template v-for="(children, name) in slotsOf(node)" :key="name" #[name]>
          <BlockRenderer
            :nodes="children"
            :editable="editable"
            :selected-id="selectedId"
            :unknown-label="unknownLabel"
            :error-label="errorLabel"
            @select="emit('select', $event)"
          />
        </template>
      </component>
    </BlockBoundary>
    <p v-else-if="unknownLabel" class="block-marker__unknown">{{ unknownLabel(node.type) }}</p>
  </div>
</template>

<style lang="scss">
.block-marker {
  --kestrel-selection: var(--color-primary, #4f46e5);
  position: relative;

  &--editable {
    outline: 1px solid transparent;
    outline-offset: -1px;
    cursor: pointer;

    &:hover {
      outline-color: color-mix(in srgb, var(--kestrel-selection) 45%, transparent);
    }
  }
  &--selected,
  &--selected:hover {
    outline: 2px solid var(--kestrel-selection);
    outline-offset: -2px;
  }
  &__error {
    margin: 0;
    padding: var(--space-3, 0.75rem);
    border: 1px dashed var(--color-danger, #b91c1c);
    color: var(--color-danger, #b91c1c);
    font-size: 0.875rem;
  }

  &__unknown {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    background: var(--color-surface-2);
  }
}
</style>
