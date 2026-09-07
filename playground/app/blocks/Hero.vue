<script setup lang="ts">
const props = defineProps({
  heading: textField({ required: true, label: { en: 'Heading', de: 'Überschrift' } }),
  image: mediaField({ accept: 'image', label: { en: 'Image', de: 'Bild' } }),
  cta: linkField({ label: 'Call to action' }),
})
defineBlock({ label: 'Hero', slots: ['default'], icon: 'image', tags: ['hero', 'marketing'] })

const ctaHref = useLinkHref(() => props.cta ?? null)
</script>

<template>
  <section class="block-hero">
    <h1 v-if="heading">{{ heading }}</h1>
    <KestrelImage v-if="image" :media="image" size="large" sizes="100vw" alt="" class="block-hero__image" />
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
  &__image {
    max-width: 100%;
    max-height: 24rem;
    justify-self: center;
    border-radius: var(--radius-lg);
    object-fit: cover;
  }
  &__cta {
    justify-self: center;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: var(--color-on-accent, #fff);
    text-decoration: none;
  }
}
</style>
