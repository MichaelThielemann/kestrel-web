import { pageDataUrl, type PageData } from './page-data'
import { sitePath } from './site-path'

/** The part of the Nuxt app a static navigation reads and writes. */
export interface StaticNavigationApp {
  readonly isHydrating?: boolean
  static: { data: Record<string, unknown> }
}

/** How a static navigation loads a page's data and leaves for a document load. */
export interface StaticNavigationOptions {
  app: StaticNavigationApp
  load: (path: string) => Promise<PageData | null>
  leave: (fullPath: string) => Promise<never>
}

interface RouteLike {
  path: string
  fullPath: string
}

/**
 * The route middleware of a statically delivered page: it loads the target page's data and hands
 * it to `useAsyncData` through `nuxtApp.static.data`, the way Nuxt's own payload loader does, or
 * leaves for a document load of the target when the data cannot be used.
 */
export function createStaticNavigation(options: StaticNavigationOptions) {
  const added = new Set<string>()
  return async (to: RouteLike, from: Pick<RouteLike, 'path'>): Promise<void> => {
    if (options.app.isHydrating) return
    const path = sitePath(to.path)
    if (path === sitePath(from.path)) return
    const page = await options.load(path)
    if (!page) return options.leave(to.fullPath)
    const store = options.app.static.data
    for (const key of added) Reflect.deleteProperty(store, key)
    added.clear()
    for (const [key, value] of Object.entries(page.data)) {
      if (!(key in store)) added.add(key)
      store[key] = value
    }
  }
}

/** The browser location a document load goes through. */
export interface DocumentLocation {
  pathname: string
  search: string
  assign(url: string): void
  reload(): void
}

/** Loads `fullPath` as a document: reloads when the browser already shows it (Back, Forward), assigns it otherwise. Never settles. */
export function leaveForDocument(baseURL: string, fullPath: string, location: DocumentLocation): Promise<never> {
  const url = pageDataUrl(baseURL, fullPath)
  const [withoutHash] = url.split('#')
  if (`${location.pathname}${location.search}` === withoutHash) location.reload()
  else location.assign(url)
  return new Promise<never>(() => {})
}
