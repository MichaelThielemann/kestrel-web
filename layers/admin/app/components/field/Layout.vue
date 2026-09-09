<script setup lang="ts">
import { computed } from 'vue'
import FieldRenderer from './Renderer.vue'
import { isFieldVisible } from '#kestrel-admin/utils/kestrel'
import type { FieldDef, LayoutNode, LayoutTrack, Localized } from '#kestrel-admin/types/kestrel'
import { resolveLocalized } from '../../utils/localized'
import type { RowErrorMap } from '../../utils/row-errors'

const props = defineProps<{
  layout?: LayoutNode[]
  fields: Record<string, FieldDef>
  values: Record<string, unknown>
  errors?: Record<string, string>
  rowErrors?: Record<string, RowErrorMap>
  locale: string
  disabled?: boolean
}>()
const emit = defineEmits<{ update: [name: string, value: unknown] }>()
const { lang } = useT()

const nodes = computed<LayoutNode[]>(() =>
  props.layout ?? Object.keys(props.fields).map((f) => ({ kind: 'row', fields: [f], tracks: [1] })),
)

interface RenderRow { fields: string[]; cols: string }
type RenderNode = { kind: 'row'; row: RenderRow } | { kind: 'group'; label: Localized; hint?: Localized; rows: RenderRow[] }

const isVisible = (name: string) => !!props.fields[name] && isFieldVisible(props.fields[name]!, props.values)
const trackToCss = (t: LayoutTrack): string => (typeof t === 'number' ? `${t}fr` : t)

function pruneRow(fields: string[], tracks: LayoutTrack[] = []): RenderRow {
  const kept: string[] = []
  const cols: string[] = []
  fields.forEach((name, i) => {
    if (isVisible(name)) { kept.push(name); cols.push(trackToCss(tracks[i] ?? 1)) }
  })
  return { fields: kept, cols: cols.join(' ') || '1fr' }
}

const renderNodes = computed<RenderNode[]>(() =>
  nodes.value.map((node) =>
    node.kind === 'group'
      ? { kind: 'group', label: node.label, ...(node.hint ? { hint: node.hint } : {}), rows: node.rows.map((r) => pruneRow(r.fields, r.tracks)) }
      : { kind: 'row', row: pruneRow(node.fields, node.tracks) },
  ),
)
</script>

<template>
  <template v-for="(node, i) in renderNodes" :key="i">

    <fieldset v-if="node.kind === 'group'" class="ui-field-group">
      <legend class="ui-field-group__legend">
        <KestrelSectionLabel :label="resolveLocalized(node.label, lang) ?? ''" :hint="resolveLocalized(node.hint, lang)" />
      </legend>
      <div
        v-for="(row, r) in node.rows"
        :key="r"
        class="ui-field-row"
        :style="{ '--ui-field-cols': row.cols }"
      >
        <div v-for="fname in row.fields" :key="fname" class="ui-field-cell">
          <FieldRenderer
            :field="fields[fname]!"
            :name="fname"
            :locale="locale"
            :disabled="disabled"
            :error="errors?.[fname] || null"
            :row-errors="rowErrors?.[fname]"
            :model-value="values[fname]"
            @update:model-value="(v) => emit('update', fname, v)"
          />
        </div>
      </div>
    </fieldset>

    <div v-else class="ui-field-row" :style="{ '--ui-field-cols': node.row.cols }">
      <div v-for="fname in node.row.fields" :key="fname" class="ui-field-cell">
        <FieldRenderer
          :field="fields[fname]!"
          :name="fname"
          :locale="locale"
          :disabled="disabled"
          :error="errors?.[fname] || null"
          :row-errors="rowErrors?.[fname]"
          :model-value="values[fname]"
          @update:model-value="(v) => emit('update', fname, v)"
        />
      </div>
    </div>
  </template>
</template>

<style lang="scss">

.ui-field-row {
  display: grid;
  grid-template-columns: var(--ui-field-cols, 1fr);
  gap: var(--space-3);
  align-items: start;
  min-inline-size: 0;
}
.ui-field-cell {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
}
.ui-field-group {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.ui-field-group__legend {
  padding: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

@media (max-width: 48rem) {
  .ui-field-row { grid-template-columns: 1fr; }
}
</style>
