<script setup lang="ts">
import { computed } from 'vue'
import UiField from '../ui/Field.vue'
import UiFieldset from '../ui/Fieldset.vue'
import UiTimeInput from '../ui/TimeInput.vue'
import UiDatePicker from '../ui/DatePicker.vue'
import UiDateRangePicker from '../ui/DateRangePicker.vue'
import type { FieldComponentProps } from '../../utils/field-component'
import type { FieldOf } from '#kestrel/types/kestrel'

const { t } = useT()
const props = defineProps<FieldComponentProps>()

const model = defineModel<number | { start: number; end: number } | null>()

const cfg = computed(() => {
  if (props.field.type !== 'datetime') return { precision: 'datetime' as const, range: false }
  const o = (props.field as FieldOf<'datetime'>).options
  return { precision: o?.precision ?? 'datetime', range: !!o?.range }
})
const required = computed(() => !!props.field.required)
const isTime = computed(() => cfg.value.precision === 'time')
const pickerPrecision = computed<'date' | 'datetime'>(() => (cfg.value.precision === 'date' ? 'date' : 'datetime'))

const pad = (n: number) => String(n).padStart(2, '0')

function toIso(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (cfg.value.precision === 'date') return date
  if (cfg.value.precision === 'time') return time
  return `${date}T${time}`
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const p = cfg.value.precision

  const parsed = Date.parse(p === 'time' ? `1970-01-01T${iso}` : p === 'date' ? `${iso}T00:00` : iso)
  return Number.isNaN(parsed) ? null : parsed
}

const single = computed<string | null>({
  get: () => toIso(model.value),
  set: (v) => { model.value = toMs(v) },
})
const range = computed<{ start: string; end: string } | null>({
  get: () => {
    const v = model.value
    if (!v || typeof v !== 'object') return null
    return { start: toIso(v.start) ?? '', end: toIso(v.end) ?? '' }
  },
  set: (v) => { model.value = v ? { start: toMs(v.start) ?? 0, end: toMs(v.end) ?? 0 } : null },
})
const rangeStart = computed<string | null>({
  get: () => range.value?.start ?? null,
  set: (v) => { range.value = { start: v ?? '', end: range.value?.end ?? '' } },
})
const rangeEnd = computed<string | null>({
  get: () => range.value?.end ?? null,
  set: (v) => { range.value = { start: range.value?.start ?? '', end: v ?? '' } },
})
</script>

<template>
  <UiField v-if="!cfg.range" :id="id" :label="name" :error="error" :required="required">
    <template #default="f">
      <UiTimeInput v-if="isTime" v-model="single" :disabled="disabled" v-bind="f" />
      <UiDatePicker
        v-else
        v-model="single"
        :precision="pickerPrecision"
        :disabled="disabled"
        :aria-label="name"
        :describedby="f['aria-describedby']"
        :invalid="f['aria-invalid'] === 'true'"
        :required="!!f.required"
      />
    </template>
  </UiField>

  <UiFieldset v-else :id="id" :label="name" :error="error" :required="required">
    <template #default="f">
      <template v-if="isTime">
        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- native wrapping label around a custom UiTimeInput; no `for`/`id` pair needed, invisible to static analysis -->
        <label class="field-datetime__sub">
          <span class="field-datetime__sublabel">{{ t('field.datetime.range_start') }}</span>
          <UiTimeInput v-model="rangeStart" :disabled="disabled" v-bind="f" />
        </label>
        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- native wrapping label around a custom UiTimeInput; no `for`/`id` pair needed, invisible to static analysis -->
        <label class="field-datetime__sub">
          <span class="field-datetime__sublabel">{{ t('field.datetime.range_end') }}</span>
          <UiTimeInput v-model="rangeEnd" :disabled="disabled" v-bind="f" />
        </label>
      </template>
      <UiDateRangePicker
        v-else
        v-model="range"
        :precision="pickerPrecision"
        :disabled="disabled"
        :aria-label="name"
        :describedby="f['aria-describedby']"
        :invalid="f['aria-invalid'] === 'true'"
        :required="!!f.required"
      />
    </template>
  </UiFieldset>
</template>

<style lang="scss">
.field-datetime__sub {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.field-datetime__sublabel {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  min-width: 3rem;
}
</style>
