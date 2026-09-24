import { onUnmounted, ref } from 'vue'

const COALESCE_MS = 1000
const CLEAR_AFTER_MS = 3000

export function useAnnouncer() {
  const message = ref('')
  let queue: string[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let clearTimer: ReturnType<typeof setTimeout> | null = null

  function announce(text: string) {
    queue.push(text)
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      message.value = queue.join(' ')
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
