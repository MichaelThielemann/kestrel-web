<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin-auth' })
const { t } = useT()
</script>

<template>
  <section class="media-page">
    <h1 class="media-page__title">{{ t('media.title') }}</h1>
    <KestrelMediaLibrary />
  </section>
</template>

<style lang="scss">

.media-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  overflow: hidden;

  &__title {
    flex: 0 0 auto;
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
  }
}
</style>
