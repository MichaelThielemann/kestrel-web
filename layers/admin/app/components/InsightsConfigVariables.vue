<script setup lang="ts">
import { computed } from 'vue'
import type { InsightsConfigVariable } from '#kestrel-admin/types/api'
import { configSourceLabel, effectiveConfigStatus } from '../utils/insights-format'

const props = withDefaults(defineProps<{ variables: InsightsConfigVariable[], labelledBy?: string, scroll?: boolean }>(), { scroll: true })
const { t } = useT()

function statusDotClass(v: InsightsConfigVariable): string {
  const status = effectiveConfigStatus(v)
  if (status === 'set') return 'insights-config__dot--set'
  if (status === 'default') return 'insights-config__dot--default'
  return v.required ? 'insights-config__dot--danger' : 'insights-config__dot--muted'
}

function statusLabel(v: InsightsConfigVariable): string {
  const status = effectiveConfigStatus(v)
  if (status === 'set') return t('insights.set')
  if (status === 'default') return v.source === undefined ? t('insights.default') : t('insights.defaultFromSource', { source: configSourceLabel(v.source, t) })
  return t('insights.notSet')
}

function statusHint(v: InsightsConfigVariable): string | undefined {
  if (effectiveConfigStatus(v) !== 'default') return undefined
  return v.source === undefined ? t('insights.defaultHint') : t('insights.defaultHintFromSource', { source: configSourceLabel(v.source, t) })
}

const WRAPPING_TYPES = new Set(['object', 'array', 'record', 'union', 'unknown'])

function valueClass(v: InsightsConfigVariable): string | undefined {
  return WRAPPING_TYPES.has(v.type) ? 'insights-config__value--wrap' : undefined
}

const regionLabel = computed(() => (props.labelledBy === undefined ? t('insights.configScrollRegion') : undefined))
</script>

<template>
  <div class="insights-config">
    <div v-if="variables.length === 0" class="insights-config__empty">{{ t('insights.noVariables') }}</div>
    <div v-else :class="scroll ? 'u-scroll' : undefined">
      <div
        :class="scroll ? undefined : 'insights-config__scroll'"
        :role="scroll ? undefined : 'region'"
        :tabindex="scroll ? undefined : 0"
        :aria-labelledby="scroll ? undefined : labelledBy"
        :aria-label="scroll ? undefined : regionLabel"
      >
        <KestrelUiTable class="insights-table" :sticky="scroll" :aria-labelledby="labelledBy">
          <template #head>
            <th scope="col" class="insights-config__col-path">{{ t('insights.colVariable') }}</th>
            <th scope="col" class="insights-config__col-type">{{ t('insights.colType') }}</th>
            <th scope="col" class="insights-config__col-required">{{ t('insights.colRequired') }}</th>
            <th scope="col">{{ t('insights.colValue') }}</th>
            <th scope="col" class="insights-config__col-default">{{ t('insights.colDefault') }}</th>
            <th scope="col" class="insights-config__col-status">{{ t('insights.colStatus') }}</th>
          </template>
          <template #body>
            <tr v-for="v in variables" :key="v.path">
              <td class="insights-config__path"><code>{{ v.path }}</code></td>
              <td class="insights-config__nowrap">{{ v.type }}</td>
              <td class="insights-config__nowrap">{{ v.required ? t('insights.required') : t('insights.optional') }}</td>
              <td class="insights-config__value" :class="valueClass(v)"><KestrelInsightsConfigValue :variable="v" /></td>
              <td class="insights-config__value" :class="valueClass(v)"><KestrelInsightsConfigValue :variable="v" field="default" /></td>
              <td class="insights-config__status">
                <span
                  class="insights-config__dot"
                  :class="statusDotClass(v)"
                  :title="statusHint(v)"
                  aria-hidden="true"
                />
                {{ statusLabel(v) }}
              </td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.insights-config {
  &__col-path {
    width: 22%;
  }
  &__col-type {
    width: 7rem;
  }
  &__col-required {
    width: 7rem;
  }
  &__col-default {
    width: 18%;
  }
  &__col-status {
    width: 10rem;
    white-space: nowrap;
  }

  &__path,
  &__nowrap,
  &__status {
    white-space: nowrap;
  }

  &__scroll {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;

    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: -2px;
    }
  }

  &__value--wrap {
    .insights-value__text {
      display: inline-block;
      max-width: 40ch;
      overflow: visible;
      white-space: normal;
      overflow-wrap: anywhere;
      text-overflow: clip;
    }
  }

  &__empty {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full, 50%);
    margin-inline-end: var(--space-1);
    background: var(--color-text-muted);

    &--set {
      background: var(--color-success);
    }
    &--default {
      background: var(--color-primary);
    }
    &--danger {
      background: var(--color-danger);
    }
    &--muted {
      background: var(--color-text-muted);
    }
  }
}
</style>
