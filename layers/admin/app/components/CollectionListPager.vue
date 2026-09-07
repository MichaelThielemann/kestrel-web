<script setup lang="ts">
import { computed } from 'vue'
import { PER_PAGE_OPTIONS } from '#kestrel/utils/kestrel'

const props = defineProps<{ page: number; totalPages: number; total: number; perPage: number }>()
const emit = defineEmits<{ 'update:page': [page: number]; 'update:perPage': [perPage: number] }>()

const { t } = useT()

const perPageId = useId()
const perPageOptions = PER_PAGE_OPTIONS.map((n) => ({ label: String(n), value: String(n) }))
const perPageModel = computed<string>({
  get: () => String(props.perPage),
  set: (v) => emit('update:perPage', Number(v)),
})

function prev() {
  if (props.page > 1) emit('update:page', props.page - 1)
}
function next() {
  if (props.page < props.totalPages) emit('update:page', props.page + 1)
}
</script>

<template>
  <div class="list__pager">
    <KestrelUiButton type="button" size="sm" :disabled="page <= 1" @click="prev">{{ t('list.prev') }}</KestrelUiButton>
    <span class="list__page">{{ t('list.page', { page, totalPages, total }) }}</span>
    <KestrelUiButton type="button" size="sm" :disabled="page >= totalPages" @click="next">{{ t('list.next') }}</KestrelUiButton>
    <label class="list__perpage" :for="perPageId">
      <span class="list__perpage-label">{{ t('list.perPage') }}</span>
      <KestrelUiSelect :id="perPageId" v-model="perPageModel" slim :options="perPageOptions" :aria-label="t('list.perPage')" />
    </label>
  </div>
</template>

<style lang="scss">
.list {
  &__pager {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  &__page {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  &__perpage {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin-inline-start: auto;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
}
</style>
