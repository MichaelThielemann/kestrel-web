import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/** Whether the element's content is wider than its box, measured again whenever the box resizes. */
export function useOverflowing(target: Ref<HTMLElement | null>): Ref<boolean> {
  const overflowing = ref(false)
  let observer: ResizeObserver | null = null

  function measure() {
    const element = target.value
    overflowing.value = !!element && element.scrollWidth > element.clientWidth
  }

  onMounted(() => {
    if (!import.meta.client || typeof ResizeObserver === 'undefined' || !target.value) return
    observer = new ResizeObserver(measure)
    observer.observe(target.value)
    measure()
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return overflowing
}
