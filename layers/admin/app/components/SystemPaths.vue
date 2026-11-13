<script setup lang="ts">
import type { PathsRebuildReport } from '#kestrel-admin/types/api'
import { answeredMessage, toApiError } from '../composables/useApi'
import { toastFailure } from '../actions/steps/notify'

interface DocRef { type: string; id: string }

const { t } = useT()
const deps = useActionDeps()
const busy = ref(false)
const report = ref<PathsRebuildReport | null>(null)
const headingId = useId()

function docRef(value: unknown): DocRef | null {
  if (typeof value !== 'object' || value === null) return null
  const type: unknown = Reflect.get(value, 'type')
  const id: unknown = Reflect.get(value, 'id')
  return typeof type === 'string' && typeof id === 'string' ? { type, id } : null
}

function refs(values: readonly unknown[]): DocRef[] {
  return values.map(docRef).filter((ref): ref is DocRef => ref !== null)
}

async function rebuild() {
  if (busy.value) return
  busy.value = true
  try {
    report.value = await deps.api<PathsRebuildReport>(deps.capabilities.route('rebuildPaths'))
    deps.toast.success(t('paths.rebuilt', { n: report.value.indexed }))
  } catch (e) {
    const err = toApiError(e)
    toastFailure(deps, answeredMessage(t, err, t('paths.rebuildFailed')), err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="paths" :aria-labelledby="headingId">
    <div class="paths__head">
      <h2 :id="headingId" class="paths__title">{{ t('paths.rebuildTitle') }}</h2>
      <KestrelUiButton type="button" size="sm" variant="secondary" icon="rotate-cw" :loading="busy" @click="rebuild">{{ t('paths.rebuild') }}</KestrelUiButton>
    </div>
    <p class="paths__desc">{{ t('paths.rebuildDesc') }}</p>
    <div v-if="report" class="paths__report" role="status">
      <p>{{ t('paths.rebuilt', { n: report.indexed }) }}</p>
      <p v-if="report.conflicts.length === 0" class="paths__desc">{{ t('paths.noConflicts') }}</p>
      <template v-else>
        <p class="paths__desc">{{ t('paths.conflictsHint') }}</p>
        <div class="paths__scroll">
          <KestrelUiTable :sticky="false">
            <template #head>
              <th scope="col">{{ t('paths.colPath') }}</th>
              <th scope="col">{{ t('paths.colReason') }}</th>
              <th scope="col">{{ t('paths.colWinner') }}</th>
              <th scope="col">{{ t('paths.colLosers') }}</th>
            </template>
            <template #body>
              <tr v-for="conflict in report.conflicts" :key="`${conflict.locale}:${conflict.path}`">
                <td class="paths__path">{{ conflict.path }} <span class="paths__locale">{{ conflict.locale.toUpperCase() }}</span></td>
                <td>{{ t(`paths.reason.${conflict.reason}`) }}</td>
                <td>
                  <NuxtLink v-for="winner in refs([conflict.winner])" :key="winner.id" :to="`/admin/${winner.type}/${winner.id}`">{{ winner.type }}/{{ winner.id }}</NuxtLink>
                </td>
                <td>
                  <ul class="paths__losers">
                    <li v-for="loser in refs(conflict.losers)" :key="loser.id">
                      <NuxtLink :to="`/admin/${loser.type}/${loser.id}`">{{ loser.type }}/{{ loser.id }}</NuxtLink>
                    </li>
                  </ul>
                </td>
              </tr>
            </template>
          </KestrelUiTable>
        </div>
      </template>
    </div>
  </section>
</template>

<style lang="scss">
.paths {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  &__title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }
  &__desc {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  &__report {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  &__scroll {
    max-height: 20rem;
    overflow: auto;
  }
  &__path {
    overflow-wrap: anywhere;
  }
  &__locale {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  &__losers {
    margin: 0;
    padding: 0;
    list-style: none;
  }
}
</style>
