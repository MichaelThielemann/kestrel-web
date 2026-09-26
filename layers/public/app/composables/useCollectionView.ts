import { computed, getCurrentInstance } from 'vue'
import type { Component, ComputedRef } from 'vue'

/** The PascalCase component name a mounted collection's documents render with: `blog` → `Blog`, `case_studies` → `CaseStudies`. */
export function collectionViewName(collection: string): string {
  return collection.split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

/**
 * The globally registered component named after a mounted collection (`app/components/global/Blog.vue` for
 * `blog`), which renders that collection's documents instead of the page template; `null` for `pages` and for
 * a collection without one. It is looked up in the app's registry, never resolved by name, so a missing one
 * falls back silently.
 */
export function useCollectionView(collection: () => string | null | undefined): ComputedRef<Component | null> {
  const components = getCurrentInstance()?.appContext.components ?? {}
  return computed(() => {
    const name = collection()
    if (!name || name === 'pages') return null
    return components[collectionViewName(name)] ?? null
  })
}

/** The mounted collection a fetched document came from, as the site page marks it; `undefined` for a page. */
export function collectionOf(document: object | null | undefined): string | undefined {
  const value: unknown = document === null || document === undefined ? undefined : Reflect.get(document, '_collection')
  return typeof value === 'string' ? value : undefined
}
