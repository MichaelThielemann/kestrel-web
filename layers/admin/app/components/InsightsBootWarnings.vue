<script setup lang="ts">
import type { InsightsBootWarning } from '#kestrel-admin/types/api'
import { contextFields } from '#kestrel-admin/utils/boot-warning-fields'

const props = defineProps<{ warnings: readonly InsightsBootWarning[] }>()
const { t } = useT()

function keyOf(warning: InsightsBootWarning): string {
  return [warning.code, ...contextFields(warning).map((field) => field.value)].join(':')
}
</script>

<template>
  <details v-if="props.warnings.length" class="insights-warnings" open>
    <summary class="insights-warnings__summary">
      <KestrelUiIcon name="triangle-alert" :size="16" />
      {{ t('insights.bootWarnings.title', { count: props.warnings.length }) }}
    </summary>
    <p class="insights-warnings__hint">{{ t('insights.bootWarnings.hint') }}</p>
    <ul class="insights-warnings__list">
      <li v-for="warning in props.warnings" :key="keyOf(warning)" class="insights-warnings__item">
        <span class="insights-badge insights-badge--warning">{{ warning.code }}</span>
        <span class="insights-warnings__message">{{ warning.message }}</span>
        <dl v-if="contextFields(warning).length" class="insights-warnings__fields">
          <template v-for="field in contextFields(warning)" :key="field.key">
            <dt>{{ field.label ? t(field.label) : field.key }}</dt>
            <dd><code>{{ field.value }}</code></dd>
          </template>
        </dl>
      </li>
    </ul>
  </details>
</template>

<style lang="scss">
.insights-warnings {
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);

  &__summary {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: var(--weight-medium);

    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
  }

  &__hint {
    margin: var(--space-2) 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__message {
    overflow-wrap: anywhere;
  }

  &__fields {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0 var(--space-2);
    margin: 0;
    font-size: var(--text-sm);

    dt {
      color: var(--color-text-muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  }
}
</style>
