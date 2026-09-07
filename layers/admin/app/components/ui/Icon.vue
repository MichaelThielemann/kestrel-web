<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { isIconName, resolveIconBody, type IconSpec } from '../../utils/icons'

const props = withDefaults(defineProps<{ name: IconSpec; size?: string | number; label?: string }>(), { size: '1em' })
const attrs = useAttrs()

const dim = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
const body = computed(() => resolveIconBody(props.name))

const dataIcon = computed(() => (isIconName(props.name) ? props.name : 'custom'))

const hasA11yName = computed(() => props.label != null || attrs.role != null || attrs['aria-label'] != null || attrs['aria-labelledby'] != null)
</script>

<template>

  <!-- eslint-disable-next-line vue/no-v-html -- sanitized via resolveIconBody -> sanitizeIconSvg (allowlist-only tags/attrs) -->
  <svg v-html="body"
    class="ui-icon"
    :data-icon="dataIcon"
    :width="dim"
    :height="dim"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="hasA11yName ? undefined : 'true'"
  />
</template>

<style lang="scss">
.ui-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
