import { onUnmounted, ref } from 'vue'

const COALESCE_MS = 1000
const CLEAR_AFTER_MS = 3000

/** A polite message that gathers what is announced within one second; `format` turns one batch into the message. */
export function useAnnouncer<T = string>(format?: (items: T[]) => string) {
  const message = ref('')
  let queue: T[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let clearTimer: ReturnType<typeof setTimeout> | null = null

  function announce(item: T) {
    queue.push(item)
    if (message.value) message.value = ''
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      message.value = format ? format(queue) : queue.join('. ')
      queue = []
      flushTimer = null
      if (clearTimer) clearTimeout(clearTimer)
      clearTimer = setTimeout(() => { message.value = '' }, CLEAR_AFTER_MS)
    }, COALESCE_MS)
  }

  onUnmounted(() => {
    if (flushTimer) clearTimeout(flushTimer)
    if (clearTimer) clearTimeout(clearTimer)
  })

  return { message, announce }
}
