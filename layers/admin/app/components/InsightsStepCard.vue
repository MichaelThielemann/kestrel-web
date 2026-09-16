<script setup lang="ts">
import type { InsightsStep } from '#kestrel-admin/types/api'

const props = defineProps<{ step: InsightsStep }>()
const { t } = useT()

const description = computed(() => props.step.description)
const errorEntries = computed(() => Object.entries(description.value?.errors ?? {}))
</script>

<template>
  <details class="insights-step">
    <summary class="insights-step__summary">
      <code class="insights-step__name">{{ step.name }}</code>
      <span v-if="step.factory" class="insights-badge insights-badge--info">{{ t('insights.factoryBadge') }}</span>
      <span v-if="description" class="insights-step__summary-text">{{ description.summary }}</span>
    </summary>

    <div class="insights-step__body">
      <p v-if="description === null" class="insights-step__muted">{{ t('insights.descriptionDependsOnArgument') }}</p>

      <template v-else>
        <div class="insights-step__badges">
          <span v-if="description.security === 'required'" class="insights-badge insights-badge--warning">{{ t('insights.securityRequired') }}</span>
          <span v-else-if="description.security === 'optional'" class="insights-badge">{{ t('insights.securityOptional') }}</span>
          <span v-if="description.multipart" class="insights-badge">{{ t('insights.multipartBadge') }}</span>
          <span v-if="description.binary" class="insights-badge">{{ t('insights.binaryBadge') }}</span>
        </div>

        <div v-if="description.reads.length" class="insights-step__row">
          <span class="insights-step__row-label">{{ t('insights.reads') }}</span>
          <span v-for="r in description.reads" :key="r" class="insights-chip">{{ r }}</span>
        </div>
        <div v-if="description.writes.length" class="insights-step__row">
          <span class="insights-step__row-label">{{ t('insights.writes') }}</span>
          <span v-for="w in description.writes" :key="w" class="insights-chip">{{ w }}</span>
        </div>

        <div v-if="description.input" class="insights-step__section">
          <h4 class="insights-step__section-title">{{ t('insights.input') }}</h4>
          <KestrelInsightsSchema :schema="description.input" />
        </div>
        <div v-if="description.query" class="insights-step__section">
          <h4 class="insights-step__section-title">{{ t('insights.query') }}</h4>
          <KestrelInsightsSchema :schema="{ type: 'object', properties: description.query }" />
        </div>
        <div v-if="description.output" class="insights-step__section">
          <h4 class="insights-step__section-title">{{ t('insights.output') }}</h4>
          <KestrelInsightsSchema :schema="description.output" />
        </div>
        <div v-if="description.extendsOutput" class="insights-step__section">
          <h4 class="insights-step__section-title">{{ t('insights.extendsOutput') }}</h4>
          <KestrelInsightsSchema :schema="description.extendsOutput" />
        </div>
        <div v-if="description.extendsItems" class="insights-step__section">
          <h4 class="insights-step__section-title">{{ t('insights.extendsItems') }}</h4>
          <KestrelInsightsSchema :schema="description.extendsItems" />
        </div>

        <div class="insights-step__section">
          <h4 class="insights-step__section-title">{{ t('insights.colErrorMessage') }}</h4>
          <p v-if="errorEntries.length === 0" class="insights-step__muted">{{ t('insights.noErrors') }}</p>
          <table v-else class="insights-step__errors">
            <thead>
              <tr>
                <th scope="col">{{ t('insights.colStatus') }}</th>
                <th scope="col">{{ t('insights.colErrorMessage') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="[status, message] in errorEntries" :key="status">
                <td>{{ status }}</td>
                <td>{{ message }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </details>
</template>

<style lang="scss">
.insights-step {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);

  &__summary {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;

    &:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
  }

  &__name {
    font-weight: var(--weight-medium);
  }

  &__summary-text {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__body {
    margin-top: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__muted {
    color: var(--color-text-muted);
    font-style: italic;
    font-size: var(--text-sm);
  }

  &__badges {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }
  &__row-label {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    margin-inline-end: var(--space-1);
  }

  &__section-title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    margin: 0 0 var(--space-1);
  }

  &__errors {
    width: 100%;
    font-size: var(--text-sm);
    border-collapse: collapse;

    th,
    td {
      text-align: start;
      padding: var(--space-1) var(--space-2);
      border-bottom: 1px solid var(--color-border);
    }
  }
}
</style>
