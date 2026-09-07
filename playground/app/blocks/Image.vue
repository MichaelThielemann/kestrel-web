<script setup lang="ts">
defineProps({
  image: mediaField({ accept: 'image', required: true, label: { en: 'Image', de: 'Bild' } }),
  alt: textField({ label: { en: 'Alternative text', de: 'Alternativtext' } }),
  caption: textField({ label: { en: 'Caption', de: 'Bildunterschrift' } }),
})
defineBlock({
  label: { en: 'Image', de: 'Bild' },
  icon: 'image',
  imageSizes: [{ name: 'content', width: 1200 }],
  tags: ['media'],
})
</script>

<template>
  <figure class="block-image">
    <KestrelImage v-if="image" :media="image" size="content" sizes="(min-width: 60rem) 60rem, 100vw" :alt="alt" />
    <figcaption v-if="caption" class="block-image__caption">{{ caption }}</figcaption>
  </figure>
</template>

<style lang="scss">
.block-image {
  margin: 0;
  padding: var(--space-4) var(--space-6);

  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--radius-lg);
  }
  &__caption {
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-align: center;
  }
}
</style>
