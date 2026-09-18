<script setup lang="ts">
import type { InsightsConfigVariable } from '#kestrel-admin/types/api'
import { effectiveConfigStatus } from '../utils/insights-format'

defineProps<{ variables: InsightsConfigVariable[] }>()
const { t } = useT()

function defaultText(v: InsightsConfigVariable): string {
  if (v.secret) return '—'
  if (!('default' in v) || v.default === undefined) return '—'
  return JSON.stringify(v.default)
}

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
    <div v-else class="list__scroll">
      <KestrelUiTable>
        <template #head>
          <th scope="col">{{ t('insights.colVariable') }}</th>
          <th scope="col">{{ t('insights.colType') }}</th>
          <th scope="col">{{ t('insights.colRequired') }}</th>
          <th scope="col">{{ t('insights.colDefault') }}</th>
          <th scope="col">{{ t('insights.colStatus') }}</th>
        </template>
        <template #body>
          <tr v-for="v in variables" :key="v.path">
            <td><code>{{ v.path }}</code></td>
            <td>{{ v.type }}</td>
            <td>{{ v.required ? t('insights.required') : t('insights.optional') }}</td>
            <td>
              {{ defaultText(v) }}
              <span v-if="v.secret" class="insights-badge insights-badge--info">{{ t('insights.secretBadge') }}</span>
            </td>
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
