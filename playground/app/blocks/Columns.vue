<script setup lang="ts">
const props = defineProps({
  ratio: choiceField({
    default: '1-1',
    label: { en: 'Ratio', de: 'Verhältnis' },
    display: 'buttons',
    choices: [{ value: '1-1', label: '1 : 1' }, { value: '2-1', label: '2 : 1' }, { value: '1-2', label: '1 : 2' }],
  }),
})
defineBlock({ label: { en: 'Columns', de: 'Spalten' }, slots: ['left', 'right'], icon: 'columns', tags: ['layout'] })

const TRACKS: Record<string, string> = { '1-1': '1fr 1fr', '2-1': '2fr 1fr', '1-2': '1fr 2fr' }
const tracks = computed(() => TRACKS[props.ratio ?? '1-1'] ?? TRACKS['1-1'])
</script>

<template>
  <section class="block-columns" :style="{ gridTemplateColumns: tracks }">
    <div class="block-columns__col"><slot name="left" /></div>
    <div class="block-columns__col"><slot name="right" /></div>
  </section>
</template>

<style lang="scss">
.block-columns {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-6);

  @media (max-width: 40rem) {
    grid-template-columns: 1fr !important;
  }
}
</style>
