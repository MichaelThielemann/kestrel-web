<script setup lang="ts">
import { useAutoRedirects } from '../composables/useAutoRedirects'

const { t } = useT()
const deps = useActionDeps()
const { items, loading, error, removing, load, remove } = useAutoRedirects(deps)
const canRemove = computed(() => deps.capabilities.has('removeAutoRedirect'))
const headingId = useId()

onMounted(() => { void load() })
</script>

<template>
  <section class="redirects-auto" :aria-labelledby="headingId">
    <div class="redirects-auto__head">
      <h2 :id="headingId" class="redirects-auto__title">{{ t('redirects.auto.title') }}</h2>
      <KestrelUiButton type="button" variant="ghost" size="sm" icon="rotate-cw" :loading="loading" :aria-label="t('redirects.auto.refresh')" @click="load" />
    </div>
    <p class="redirects-auto__desc">{{ t('redirects.auto.desc') }}</p>
    <KestrelUiAlert v-if="error" variant="error">{{ error }}</KestrelUiAlert>
    <p v-else-if="!loading && items.length === 0" class="redirects-auto__empty">{{ t('redirects.auto.empty') }}</p>
    <div v-else class="redirects-auto__scroll">
      <KestrelUiTable :sticky="false">
        <template #head>
          <th scope="col">{{ t('redirects.auto.from') }}</th>
          <th scope="col">{{ t('redirects.auto.to') }}</th>
          <th v-if="canRemove" scope="col"><span class="redirects-auto__vh">{{ t('a11y.rowActions') }}</span></th>
        </template>
        <template #body>
          <tr v-for="item in items" :key="item.from">
            <td class="redirects-auto__path">{{ item.from }}</td>
            <td class="redirects-auto__path">{{ item.to }}</td>
            <td v-if="canRemove" class="redirects-auto__action">
              <KestrelUiButton
                type="button"
                variant="danger-ghost"
                size="sm"
                icon="trash"
                :loading="removing === item.from"
                :disabled="removing !== null"
                :aria-label="t('redirects.auto.remove', { from: item.from })"
                @click="remove(item.from)"
              />
            </td>
          </tr>
        </template>
      </KestrelUiTable>
    </div>
  </section>
</template>

<style lang="scss">
.redirects-auto {
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
  &__desc,
  &__empty {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  &__scroll {
    max-height: 20rem;
    overflow: auto;
  }
  &__path {
    overflow-wrap: anywhere;
  }
  &__action {
    width: 1%;
    white-space: nowrap;
  }
  &__vh {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}
</style>
