

const KESTREL_OWNED = /[/\\]kestrel[/\\]layers[/\\]/
const KESTREL_EXTENSION = /[/\\]kestrel-[^/\\]+[/\\]/
const SCOPED = /[?&]scoped[=&]/

export function isProtectedStyle(devId: string, href: string, hasDataKestrel: boolean): boolean {
  if (hasDataKestrel) return true
  if (SCOPED.test(devId)) return true
  return KESTREL_OWNED.test(devId) || KESTREL_OWNED.test(href) || KESTREL_EXTENSION.test(devId) || KESTREL_EXTENSION.test(href)
}
