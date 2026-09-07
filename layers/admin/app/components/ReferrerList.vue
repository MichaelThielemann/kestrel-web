<script setup lang="ts">
import { toRef } from 'vue'
import type { ReferenceTo } from '#kestrel/types/api'
import { referrerPath } from '../utils/referrer-label'

const props = defineProps<{ refs: ReferenceTo[] }>()
const { labelOf } = useReferrerLabels(toRef(props, 'refs'))
</script>

<template>
  <ul class="referrer-list">
    <li v-for="r in refs" :key="`${r.type}/${r.id}/${r.field}`">
      <NuxtLink :to="referrerPath(r)">{{ labelOf(r) }}</NuxtLink>
    </li>
  </ul>
</template>
