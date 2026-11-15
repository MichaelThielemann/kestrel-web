<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { StatusLine } from '../utils/crop-advice'

const props = withDefaults(defineProps<{ lines?: readonly StatusLine[], error?: string }>(), { lines: () => [], error: '' })

const ANNOUNCE_DELAY = 700
const CLEAR_DELAY = 3000
const spoken = ref('')
const advice = computed(() => props.lines.map((line) => line.text).join(' '))
let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

function later(delay: number, run: () => void): void {
  clearTimer()
  timer = setTimeout(() => {
    timer = null
    run()
  }, delay)
}

const stopAdvice = watch(advice, (text) => {
  spoken.value = ''
  later(ANNOUNCE_DELAY, () => {
    spoken.value = text
    if (text) later(CLEAR_DELAY, () => { spoken.value = '' })
  })
})
const root = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null

onMounted(() => {
  const status = root.value
  const column = status?.parentElement
  if (!status || !column || typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => column.style.setProperty('scroll-padding-bottom', `${status.offsetHeight}px`))
  observer.observe(status)
})

onUnmounted(() => {
  stopAdvice()
  clearTimer()
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="root" class="media-crop-status" data-test="crop-status">
    <p v-if="error" class="media-crop-status__line" data-tone="error" data-test="crop-error">
      <KestrelUiIcon name="triangle-alert" :size="16" class="media-crop-status__icon" />{{ error }}
    </p>
    <slot name="state" />
    <p v-for="line in lines" :key="line.id" class="media-crop-status__line" :data-tone="line.tone" v-bind="line.attrs">
      <KestrelUiIcon :name="line.tone === 'warning' ? 'triangle-alert' : 'info'" :size="16" class="media-crop-status__icon" />{{ line.text }}
    </p>
    <div v-if="$slots.action" class="media-crop-status__action"><slot name="action" /></div>
    <KestrelUiLiveStatus :message="spoken" />
  </div>
</template>

<style lang="scss" scoped>
@use '../assets/scss/crop-stage';

.media-crop-status {
  position: sticky;
  bottom: 0;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  min-height: 5.5rem;
  margin-bottom: calc(-1 * var(--space-3));
  padding-block: var(--space-3);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: var(--text-sm);

  @media (max-width: crop-stage.$narrow) {
    position: static;
  }
}
.media-crop-status__line {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text);
  overflow-wrap: anywhere;

  &[data-tone='warning'] .media-crop-status__icon { color: var(--color-warning-text); }
  &[data-tone='error'] { color: var(--color-danger); }
  &[data-tone='info'] .media-crop-status__icon { color: var(--color-text-muted); }
}
.media-crop-status__icon { flex: 0 0 auto; margin-top: 2px; }
</style>
