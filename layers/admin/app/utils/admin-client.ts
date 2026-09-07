import { isProtectedStyle } from './admin-style-guard'
import { makeReauthInterceptor } from './reauth'

function isKestrelOwned(node: Element): boolean {
  const el = node as HTMLElement
  const devId = el.dataset?.viteDevId ?? ''
  const href = node.getAttribute?.('href') ?? ''
  return isProtectedStyle(devId, href, el.dataset?.kestrel !== undefined)
}

function installReauth(): void {
  const auth = useAuth()
  const router = useRouter()
  const onResponseError = makeReauthInterceptor({
    currentPath: () => router.currentRoute.value.fullPath,
    reset: () => auth.reset(),
    navigate: (to) => { navigateTo(to) },
  })
  globalThis.$fetch = globalThis.$fetch.create({ onResponseError }) as typeof globalThis.$fetch
}

function installStyleGuard(): void {
  const disabled = new Map<Element, string | null>()
  let observer: MutationObserver | undefined

  const disableForeign = () => {
    for (const node of document.querySelectorAll('style, link[rel~="stylesheet"]')) {
      if (isKestrelOwned(node) || disabled.has(node)) continue
      disabled.set(node, node.getAttribute('media'))
      node.setAttribute('media', 'not all')
    }
  }

  const restoreAll = () => {
    for (const [node, media] of disabled) {
      if (media === null) node.removeAttribute('media')
      else node.setAttribute('media', media)
    }
    disabled.clear()
  }

  const apply = (path: string) => {
    const onAdmin = path === '/admin' || path.startsWith('/admin/')
    if (!onAdmin) {
      observer?.disconnect()
      observer = undefined
      restoreAll()
      return
    }
    disableForeign()
    if (!observer) {
      observer = new MutationObserver(disableForeign)
      observer.observe(document.head, { childList: true, subtree: true })
    }
  }

  addRouteMiddleware('kestrel-admin-style-guard', (to) => { apply(to.path) }, { global: true })
  apply(useRoute().path)
}

let installed = false

export function installAdminClient(): void {
  if (installed || !import.meta.client) return
  installed = true
  installReauth()
  if (import.meta.dev) installStyleGuard()
}
