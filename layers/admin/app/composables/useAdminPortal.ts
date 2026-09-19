import { computed, shallowRef } from 'vue'

export const ADMIN_PORTAL_ID = 'kestrel-admin-portal'

const hostElement = shallowRef<HTMLElement | null>(null)

export function setAdminPortalHost(el: HTMLElement | null) {
  hostElement.value = el
}

export function useAdminPortal() {
  const target = computed<string | HTMLElement>(() => hostElement.value ?? 'body')
  return { target }
}
