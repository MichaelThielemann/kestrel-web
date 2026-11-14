<script setup lang="ts">
const props = defineProps<{ collapsed: boolean }>()
const { t } = useT()
const route = useRoute()
const { count } = useDeadLetterCount()
const dead = computed(() => t('nav.systemDead', { n: count.value }))
const title = computed(() => {
  if (!props.collapsed) return undefined
  return count.value > 0 ? `${t('nav.system')} · ${dead.value}` : t('nav.system')
})
</script>

<template>
  <NuxtLink
    to="/admin/system"
    class="rail__item rail__item--system"
    :class="{ 'router-link-active': isNavItemActive(route.path, '/admin/system') }"
    :title="title"
  >
    <KestrelUiIcon name="settings" class="rail__icon" size="1.25rem" />
    <span class="rail__label">{{ t('nav.system') }}</span>
    <template v-if="count > 0">
      <KestrelUiBadge variant="counter" class="rail__badge" aria-hidden="true">{{ count }}</KestrelUiBadge>
      <span class="rail__sr">{{ dead }}</span>
    </template>
  </NuxtLink>
</template>

<style lang="scss">
@use '../assets/scss/mixins';

.rail__item--system {
  position: relative;
}

.rail__sr {
  @include mixins.sr-only;
}
</style>
