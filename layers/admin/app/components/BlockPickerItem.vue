<script setup lang="ts">
import { computed, ref } from 'vue'
import { resolveLocalized } from '#kestrel-admin/utils/localized'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import type { BlockPickerView } from '../utils/block-picker-view'
import BlockPickerDetails from './BlockPickerDetails.vue'

const props = defineProps<{
  type: SerializedBlock
  lang: string
  view: BlockPickerView
  iconSize: number
  disabled?: boolean
  favorite: boolean
}>()

const emit = defineEmits<{ pick: [string]; 'toggle-favorite': [string] }>()

const { t } = useT()

const label = computed(() => resolveLocalized(props.type.label, props.lang) ?? props.type.name)
const description = computed(() => resolveLocalized(props.type.description, props.lang))

const detailsOpen = ref(false)
</script>

<template>
  <li class="block-picker-item">
    <button
      type="button"
      class="block-picker-item__pick"
      :disabled="disabled"
      :aria-label="t('blocks.addOfType', { type: label })"
      @click="emit('pick', type.name)"
    >
      <img v-if="type.image" :src="type.image" alt="" loading="lazy" class="block-picker-item__img" >
      <KestrelUiIcon v-else :name="type.icon ?? 'layout-grid'" :size="iconSize" class="block-picker-item__icon" />
      <span class="block-picker-item__text">
        <span class="block-picker-item__label">{{ label }}</span>
        <span v-if="view === 'list' && description" class="block-picker-item__meta">{{ description }}</span>
      </span>
    </button>

    <button
      type="button"
      class="block-picker-item__favorite"
      :aria-pressed="favorite"
      :aria-label="t(favorite ? 'blocks.pickerRemoveFavorite' : 'blocks.pickerAddFavorite')"
      @click.stop="emit('toggle-favorite', type.name)"
    >
      <KestrelUiIcon name="star" :size="16" />
    </button>

    <KestrelUiPopover v-model:open="detailsOpen" side="right" align="start">
      <template #trigger>
        <button type="button" class="block-picker-item__info" :aria-label="t('blocks.pickerDetailsFor', { type: label })" @click.stop>
          <KestrelUiIcon name="info" :size="16" />
        </button>
      </template>
      <BlockPickerDetails :type="type" :lang="lang" />
    </KestrelUiPopover>
  </li>
</template>

<style lang="scss">
.block-picker-item {
  position: relative;
  display: flex;
  align-items: stretch;
}
.block-picker-item__pick {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-xs);
  line-height: 1.2;
  text-align: center;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-hover);
    border-color: var(--color-border);
  }
  &:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: -2px;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.block-picker-item__favorite,
.block-picker-item__info {
  position: absolute;
  top: var(--space-1);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-subtle);
  cursor: pointer;

  &:hover {
    background: var(--color-hover);
    color: var(--color-text);
  }
  &:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 1px;
  }
}
.block-picker-item__favorite {
  right: 2rem;

  &[aria-pressed='true'] {
    color: var(--color-warning);
  }
  &[aria-pressed='true'] .ui-icon {
    fill: currentColor;
  }
}
.block-picker-item__info {
  right: var(--space-1);
}
.block-picker__grid--grid .block-picker-item__favorite,
.block-picker__grid--grid .block-picker-item__info,
.block-picker__grid--large .block-picker-item__favorite,
.block-picker__grid--large .block-picker-item__info {
  opacity: 0;
}
.block-picker__grid--grid .block-picker-item:hover .block-picker-item__favorite,
.block-picker__grid--grid .block-picker-item:hover .block-picker-item__info,
.block-picker__grid--grid .block-picker-item__favorite:focus-visible,
.block-picker__grid--grid .block-picker-item__info:focus-visible,
.block-picker__grid--large .block-picker-item:hover .block-picker-item__favorite,
.block-picker__grid--large .block-picker-item:hover .block-picker-item__info,
.block-picker__grid--large .block-picker-item__favorite:focus-visible,
.block-picker__grid--large .block-picker-item__info:focus-visible {
  opacity: 1;
}
.block-picker__grid--list .block-picker-item__pick {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-8) var(--space-1) var(--space-2);
  min-height: 2.5rem;
  text-align: left;
  font-size: var(--text-sm);
}
.block-picker__grid--list .block-picker-item__favorite,
.block-picker__grid--list .block-picker-item__info {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}
.block-picker-item__icon {
  flex-shrink: 0;
  color: var(--color-text-subtle);
}
.block-picker-item__img {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.block-picker__grid--large .block-picker-item__img {
  aspect-ratio: auto;
  height: auto;
  object-fit: contain;
}
.block-picker__grid--list .block-picker-item__img {
  flex-shrink: 0;
  width: 4rem;
  aspect-ratio: auto;
  height: 2.5rem;
  object-fit: cover;
}
.block-picker-item__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.block-picker__grid--list .block-picker-item__text {
  align-items: flex-start;
  text-align: left;
}
.block-picker-item__label {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: capitalize;
}
.block-picker-item__meta {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
</style>
