<script setup lang="ts">
const props = defineProps({
  heading: textField({ required: true, label: { en: 'Heading', de: 'Überschrift' } }),
  image: mediaField({ accept: 'image', label: { en: 'Image', de: 'Bild' } }),
  cta: linkField({ label: 'Call to action' }),
  accent: field('color', { label: { en: 'Accent colour', de: 'Akzentfarbe' }, default: '#2266cc' }),
})
defineBlock({
  label: 'Hero',
  slots: ['default'],
  icon: 'image',
  tags: ['hero', 'marketing'],
  imageSizes: [
    { name: 'hero-wide-sm', width: 576, height: 324, fit: 'cover' },
    { name: 'hero-wide', width: 1152, height: 648, fit: 'cover' },
    { name: 'hero-tall-sm', width: 360, height: 480, fit: 'cover' },
    { name: 'hero-tall', width: 720, height: 960, fit: 'cover' },
  ],
})

const art = [{ media: '(min-width: 48rem)', size: 'hero-wide' }]
const ctaHref = useLinkHref(() => props.cta ?? null)
const accentColor = computed(() => (typeof props.accent === 'string' ? props.accent : undefined))
</script>

<template>
  <section class="block-hero" :style="{ '--block-hero-accent': accentColor }">
    <h1 v-if="heading">{{ heading }}</h1>
    <KestrelImage v-if="image" :media="image" size="hero-tall" :art="art" sizes="100vw" alt="" class="block-hero__image" />
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
    width: 100%;
    height: auto;
    justify-self: center;
    border-radius: var(--radius-lg);
  }
  &__cta {
    justify-self: center;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--block-hero-accent, var(--color-accent));
    color: var(--color-on-accent, #fff);
    text-decoration: none;
  }
}
</style>
