<script setup lang="ts">
const props = defineProps({
  heading: textField({ required: true, label: 'Heading' }),
  subheading: textField({ multiline: true, label: 'Subheading' }),
  cta: linkField({ label: 'Call to action' }),
})
defineBlock({ label: 'Hero', slots: ['default'], icon: 'image' })

const ctaHref = useLinkHref(() => props.cta ?? null)
</script>

<template>
  <section class="block-hero">
    <h1 v-if="heading">{{ heading }}</h1>
    <p v-if="subheading" class="block-hero__subheading">{{ subheading }}</p>
    <slot />
    <a v-if="ctaHref" :href="ctaHref" class="block-hero__cta">{{ cta?.label || ctaHref }}</a>
  </section>
</template>

<style lang="scss">
.block-hero {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-8) var(--space-6);
  text-align: center;

  h1 {
    font-size: var(--text-3xl, 2.25rem);
    font-weight: var(--weight-bold);
    line-height: 1.15;
  }
  &__subheading {
    max-width: 60ch;
    justify-self: center;
    line-height: 1.5;
  }
  &__cta {
    justify-self: center;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-on-accent, #fff);
    text-decoration: none;
  }
  &__cta:focus-visible {
    outline: 2px solid currentcolor;
    outline-offset: 2px;
  }
}
</style>
