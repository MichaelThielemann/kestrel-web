<script setup lang="ts">
import type { InsightsConfigVariable } from '#kestrel-admin/types/api'
import { effectiveConfigStatus } from '../utils/insights-format'

withDefaults(defineProps<{ variables: InsightsConfigVariable[], labelledBy?: string, scroll?: boolean }>(), { scroll: true })
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
  if (status === 'default') return t('insights.default')
  return t('insights.notSet')
}
</script>

<template>
  <div class="insights-config">
    <div v-if="variables.length === 0" class="insights-config__empty">{{ t('insights.noVariables') }}</div>
    <div v-else :class="scroll ? 'list__scroll' : undefined">
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
            <td>{{ v.type }}</td>
            <td>{{ v.required ? t('insights.required') : t('insights.optional') }}</td>
            <td><KestrelInsightsConfigValue :variable="v" /></td>
            <td><KestrelInsightsConfigValue :variable="v" field="default" /></td>
            <td>
              <span
                class="insights-config__dot"
                :class="statusDotClass(v)"
                :title="effectiveConfigStatus(v) === 'default' ? t('insights.defaultHint') : undefined"
                aria-hidden="true"
              />
              {{ statusLabel(v) }}
            </td>
          </tr>
        </template>
      </KestrelUiTable>
    </div>
  </div>
</template>

<style lang="scss">
.insights-config {
  .insights-table {
    table-layout: fixed;
  }

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
    width: 8rem;
  }

  &__path {
    overflow-wrap: anywhere;
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
