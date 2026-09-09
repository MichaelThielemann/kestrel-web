<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { SerializedBlock } from '#kestrel-admin/types/kestrel'
import type { IconName } from '#kestrel-admin/utils/icons'
import { useBlockPickerView } from '../composables/useBlockPickerView'
import { useBlockPickerTags } from '../composables/useBlockPickerTags'
import { useBlockPickerFavorites } from '../composables/useBlockPickerFavorites'
import { useBlockPickerRecent } from '../composables/useBlockPickerRecent'
import { collectBlockTags, filterBlockTypes } from '../utils/block-picker-filter'
import { groupBlockTypes, type BlockPickerGroupKind } from '../utils/block-picker-groups'
import { blockTagLabel } from '../utils/collections'
import BlockPickerItem from './BlockPickerItem.vue'

const props = defineProps<{
  open: boolean
  types: SerializedBlock[]
  lang: string
  disabled?: boolean
  pasteCount?: number
}>()

const emit = defineEmits<{ 'update:open': [boolean]; pick: [string]; paste: [] }>()

const { t } = useT()

const { view: pickerView, setView: setPickerView } = useBlockPickerView()
const { tags: storedTags, setTags } = useBlockPickerTags()
const { favorites, toggleFavorite } = useBlockPickerFavorites()
const { recent, recordPick } = useBlockPickerRecent()

const PICKER_VIEW_OPTIONS = computed<{ label: string; value: string; icon: IconName }[]>(() => [
  { label: t('blocks.pickerViewGrid'), value: 'grid', icon: 'layout-grid' },
  { label: t('blocks.pickerViewLarge'), value: 'large', icon: 'image' },
  { label: t('blocks.pickerViewList'), value: 'list', icon: 'list' },
])

const pickerViewModel = computed<string | string[] | null>({
  get: () => pickerView.value,
  set: (v) => { if (typeof v === 'string') setPickerView(v as typeof pickerView.value) },
})

const PICKER_ICON_SIZES: Record<typeof pickerView.value, number> = { grid: 24, large: 32, list: 20 }
const pickerIconSize = computed(() => PICKER_ICON_SIZES[pickerView.value])

const search = ref('')
const resultsId = useId()

const availableTags = computed(() => collectBlockTags(props.types))
const selectedTags = computed(() => storedTags.value.filter((tag) => availableTags.value.includes(tag)))

const tagOptions = computed(() => availableTags.value.map((tag) => ({ label: blockTagLabel(tag, props.lang), value: tag })))
const tagsModel = computed<string | string[] | null>({
  get: () => selectedTags.value,
  set: (v) => setTags(Array.isArray(v) ? v : []),
})

const filteredTypes = computed(() => filterBlockTypes({ types: props.types, query: search.value, tags: selectedTags.value, lang: props.lang }))
const hasActiveFilters = computed(() => search.value.trim() !== '' || selectedTags.value.length > 0)
const resultsLabel = computed(() => t(filteredTypes.value.length === 1 ? 'blocks.pickerResult' : 'blocks.pickerResults', { n: filteredTypes.value.length }))

const groups = computed(() => (
  hasActiveFilters.value ? [{ kind: 'all' as const, types: filteredTypes.value }] : groupBlockTypes(filteredTypes.value, favorites.value, recent.value)
))
const showGroupHeadings = computed(() => groups.value.length > 1)

const GROUP_LABEL_KEYS: Record<BlockPickerGroupKind, string> = {
  favorites: 'blocks.pickerFavoritesGroup',
  recent: 'blocks.pickerRecentGroup',
  all: 'blocks.pickerAllGroup',
}

function resetFilters(): void {
  search.value = ''
  setTags([])
}

function pick(type: string): void {
  recordPick(type)
  emit('pick', type)
}

const searchWrapRef = ref<HTMLElement | null>(null)
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    searchWrapRef.value?.querySelector('input')?.focus()
  },
)
</script>

<template>
  <KestrelUiDialog :open="open" size="lg" :title="t('blocks.pickType')" @update:open="emit('update:open', $event)">
    <div v-if="pasteCount" class="block-picker__paste">
      <KestrelUiButton type="button" variant="secondary" size="sm" icon="clipboard-paste" :disabled="disabled" @click="emit('paste')">
        {{ t(pasteCount === 1 ? 'blocks.pasteFromClipboard' : 'blocks.pasteFromClipboardPlural', { n: pasteCount }) }}
      </KestrelUiButton>
    </div>

    <div class="block-picker__filters">
      <label ref="searchWrapRef" class="block-picker__search">
        <span class="block-picker__vh">{{ t('blocks.pickerSearchLabel') }}</span>
        <KestrelUiTextInput
          v-model="search"
          type="search"
          icon="search"
          slim
          :aria-controls="resultsId"
          :placeholder="t('blocks.pickerSearchPlaceholder')"
        />
      </label>

      <div v-if="availableTags.length" class="block-picker__tags" role="group" :aria-label="t('blocks.pickerTagsLabel')">
        <KestrelUiButtonGroup v-model="tagsModel" multiple :options="tagOptions" :aria-label="t('blocks.pickerTagsLabel')" />
        <KestrelUiButton v-if="selectedTags.length" type="button" variant="ghost" size="sm" @click="setTags([])">{{ t('blocks.pickerTagsReset') }}</KestrelUiButton>
      </div>

      <div class="block-picker__header">
        <span class="block-picker__count" aria-live="polite">{{ resultsLabel }}</span>
        <KestrelUiButtonGroup v-model="pickerViewModel" :options="PICKER_VIEW_OPTIONS" :aria-label="t('blocks.pickerViewAriaLabel')" />
      </div>
    </div>

    <div class="block-picker__body">
      <div v-if="filteredTypes.length" :id="resultsId">
        <div v-for="group in groups" :key="group.kind" class="block-picker__group">
          <h3 v-if="showGroupHeadings" class="block-picker__group-heading">{{ t(GROUP_LABEL_KEYS[group.kind]) }}</h3>
          <ul
            class="block-picker__grid"
            :class="`block-picker__grid--${pickerView}`"
            :aria-label="showGroupHeadings ? t(GROUP_LABEL_KEYS[group.kind]) : t('blocks.pickType')"
          >
            <BlockPickerItem
              v-for="bt in group.types"
              :key="`${group.kind}-${bt.name}`"
              :type="bt"
              :lang="lang"
              :view="pickerView"
              :icon-size="pickerIconSize"
              :disabled="disabled"
              :favorite="favorites.includes(bt.name)"
              @pick="pick"
              @toggle-favorite="toggleFavorite"
            />
          </ul>
        </div>
      </div>

      <KestrelUiEmptyState v-else :id="resultsId" icon="search" :title="t('blocks.pickerEmptyTitle')">
        <template v-if="hasActiveFilters" #action>
          <KestrelUiButton type="button" variant="secondary" size="sm" @click="resetFilters">{{ t('blocks.pickerEmptyReset') }}</KestrelUiButton>
        </template>
      </KestrelUiEmptyState>
    </div>
  </KestrelUiDialog>
</template>

<style lang="scss">
@use '../assets/scss/mixins';

.block-picker {
  &__vh { @include mixins.sr-only; }

  &__paste {
    margin-bottom: var(--space-3);
  }
  &__filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  &__search {
    width: 100%;
  }
  &__tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  &__count {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  &__body {
    max-height: min(60vh, 32rem);
    overflow-y: auto;
  }
  &__group + &__group {
    margin-top: var(--space-4);
  }
  &__group-heading {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-muted);
  }
  &__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
    gap: var(--space-2);
  }
  &__grid--large {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: var(--space-4);
  }
  &__grid--list {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
