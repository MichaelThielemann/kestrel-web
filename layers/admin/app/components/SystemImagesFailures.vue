<script setup lang="ts">
import type { ImagesFailedVariant } from '#kestrel-admin/types/api'
import { humanizeRelativeTime } from '#kestrel-admin/utils/humanize'

defineProps<{ variants: number, recent: readonly ImagesFailedVariant[] }>()

const { t, lang } = useT()

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function absolute(ms: number): string { return dateFmt.format(new Date(ms)) }
function relative(ms: number): string { return humanizeRelativeTime(ms, lang.value) }
</script>

<template>
  <div class="images-failures">
    <KestrelUiEmptyState v-if="recent.length === 0" icon="check" :title="t('images.noFailures')" :description="t('images.noFailuresHint')" />
    <template v-else>
      <p class="images-failures__count">{{ t('images.failedCount', { variants, shown: recent.length }) }}</p>
      <div class="images-failures__scroll">
        <KestrelUiTable :sticky="false">
          <template #head>
            <th scope="col">{{ t('images.colMedia') }}</th>
            <th scope="col">{{ t('images.colSizeName') }}</th>
            <th scope="col">{{ t('images.colAttempts') }}</th>
            <th scope="col">{{ t('images.colError') }}</th>
            <th scope="col">{{ t('images.colWhen') }}</th>
          </template>
          <template #body>
            <tr v-for="f in recent" :key="`${f.mediaId}:${f.size}`">
              <td>
                <NuxtLink class="images-failures__media" to="/admin/media" :title="f.mediaId">{{ f.mediaId }}</NuxtLink>
              </td>
              <td>{{ f.size }}</td>
              <td class="images-failures__num">{{ f.attempts }}</td>
              <td class="images-failures__error">{{ f.error ?? '—' }}</td>
              <td class="images-failures__when" :title="absolute(f.updatedAt)">{{ relative(f.updatedAt) }}</td>
            </tr>
          </template>
        </KestrelUiTable>
      </div>
    </template>
  </div>
</template>

<style lang="scss">
.images-failures {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  &__count {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  &__scroll {
    max-height: 18rem;
    overflow: auto;
  }

  &__media {
    display: inline-block;
    max-width: 14rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  &__num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  &__error {
    min-width: 14rem;
    overflow-wrap: anywhere;
  }

  &__when {
    white-space: nowrap;
  }
}
</style>
