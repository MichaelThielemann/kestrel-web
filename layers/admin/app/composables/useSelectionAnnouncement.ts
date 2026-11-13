import { ref, watch } from 'vue'

/** The text for an always-mounted status region that announces a selection: its label while anything is selected, and `cleared` once it drops to nothing. */
export function useSelectionAnnouncement(count: () => number, label: (n: number) => string, cleared: () => string) {
  const message = ref('')
  watch(count, (n, prev) => {
    if (n > 0) message.value = label(n)
    else if (prev > 0) message.value = cleared()
  })
  return message
}
