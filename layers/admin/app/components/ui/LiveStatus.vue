<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <p class="ui-live-status" role="status" aria-live="polite">{{ message }}</p>
</template>

<style lang="scss" scoped>
@use '../../assets/scss/mixins';

.ui-live-status { @include mixins.sr-only; }
</style>
