import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

const BYPASS_TTL_MS = 2000

const dirtyChecks = new Set<() => boolean>()
let bypassUntil = 0

export function hasUnsavedChanges(): boolean {
  return [...dirtyChecks].some((check) => check())
}

function takeBypass(): boolean {
  if (bypassUntil === 0) return false
  const granted = Date.now() < bypassUntil
  bypassUntil = 0
  return granted
}

export function confirmDiscard(message: string): boolean {
  if (!hasUnsavedChanges()) return true
  if (!confirm(message)) return false
  bypassUntil = Date.now() + BYPASS_TTL_MS
  return true
}

export function useUnsavedGuard(isDirty: () => boolean, message: () => string, skip: () => boolean = () => false): void {
  dirtyChecks.add(isDirty)
  onUnmounted(() => dirtyChecks.delete(isDirty))
  const guard = () => {
    if (takeBypass()) return
    if (!skip() && isDirty() && !confirm(message())) return false
  }
  onBeforeRouteLeave(guard)
  onBeforeRouteUpdate(guard)
}
