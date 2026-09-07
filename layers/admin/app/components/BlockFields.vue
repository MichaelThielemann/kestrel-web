<script setup lang="ts">
import { computed } from 'vue'
import type { LayoutNode, SerializedBlock } from '#kestrel/types/kestrel'
import type { BlockRow } from '../utils/block-tree'
import { resolveLocalized } from '#kestrel/utils/localized'
import { blockRowErrors } from '../utils/edit-form'

const props = defineProps<{
  block: BlockRow
  def?: SerializedBlock
  locale: string
  disabled?: boolean

  errors?: { field?: string; message: string; path?: string[] }[]
}>()
const emit = defineEmits<{ update: [key: string, value: unknown] }>()

const { t, lang } = useT()
const subFields = computed(() =>
  Object.fromEntries(Object.entries(props.def?.fields ?? {}).map(([k, v]) => [k, asFieldDef(v)])),
)

const fieldErrors = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  for (const e of props.errors ?? []) if (e.field && e.field in subFields.value && !e.path?.length) out[e.field] = e.message
  return out
})
const blockAlerts = computed(() =>
  (props.errors ?? []).filter((e) => (!e.field || !(e.field in subFields.value)) && !e.path?.length).map((e) => e.message),
)
const fieldRowErrors = computed(() => blockRowErrors(props.errors ?? []))

const blockLayout = computed(() => (props.def as { fieldLayout?: LayoutNode[] } | undefined)?.fieldLayout)
</script>

<template>
  <div class="block-fields">
    <p class="block-fields__title">{{ resolveLocalized(def?.label, lang) ?? block.type }}</p>
    <p v-for="(msg, i) in blockAlerts" :key="i" class="block-fields__alert" role="alert">{{ msg }}</p>
    <KestrelFieldLayout
      :layout="blockLayout"
      :fields="subFields"
      :values="block.props"
      :errors="fieldErrors"
      :row-errors="fieldRowErrors"
      :locale="locale"
      :disabled="disabled"
      @update="(key, value) => emit('update', key, value)"
    />
    <p v-if="!Object.keys(subFields).length" class="block-fields__empty">{{ t('blocks.noFields') }}</p>
  </div>
</template>

<style lang="scss">
.block-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    text-transform: capitalize;
  }
  &__empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  &__alert {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-sm);
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
}
</style>
