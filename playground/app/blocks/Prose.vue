<script setup lang="ts">

const props = defineProps({
  body: richtextField({ required: true, label: { en: 'Text', de: 'Text' } }),
})
defineBlock({ label: { en: 'Prose', de: 'Fließtext' }, icon: 'file-text' })

const raw = computed(() => stripBrokenPageLinks(resolveRichtextLinks(props.body ?? '', (collection, id) => linkHref({ type: 'internal', collection, id }))))
const { data: html } = await useSanitizedHtml(raw)
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitized by useSanitizedHtml -->
  <div class="block-prose" v-html="html" />
</template>

<style lang="scss">
.block-prose {
  max-width: 68ch;
  margin-inline: auto;
  padding: var(--space-4) var(--space-6);
  line-height: 1.6;

  h2, h3 { margin-block: 1.2em 0.4em; font-weight: var(--weight-bold); }
  p { margin-block: 0.6em; }
  ul, ol { padding-inline-start: 1.5em; }
  a { color: var(--color-accent); }
}
</style>
