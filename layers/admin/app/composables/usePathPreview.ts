import { computed, onUnmounted, ref, watch } from 'vue'
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { PathPreview } from '#kestrel-admin/types/api'
import type { ActionDeps } from '../actions/types'

const DEBOUNCE_MS = 250

export interface PathPreviewSource {
  collection: string
  id: string
  locale: () => string
  slug: () => string
  /** The parent page the form holds: an id, `null` for top level, `undefined` when the collection has no parent field. */
  parent: () => string | null | undefined
  /** Whether the form's status makes the document live, so a path it cannot reach is worth naming. */
  live: () => boolean
}

export interface PathPreviewState {
  /** The public path the document would get with the form's values, `null` while unknown or unavailable. */
  preview: Ref<PathPreview | null>
  /** Why a live document would not be reachable at its path, other than a taken path; `null` otherwise. */
  unreachable: ComputedRef<string | null>
}

export const pathPreviewKey = Symbol('kestrel.pathPreview') as InjectionKey<PathPreviewState>

/** Asks `site-default` for the public path the form's slug and parent would give the document, debounced per change; nothing without the collection's `previewPath` verb. */
export function usePathPreview(deps: Pick<ActionDeps, 'api' | 'capabilities'>, source: PathPreviewSource): PathPreviewState {
  const preview = ref<PathPreview | null>(null)
  const available = deps.capabilities.hasVerb(source.collection, 'previewPath')
  let timer: ReturnType<typeof setTimeout> | undefined
  let request = 0

  async function load(slug: string, locale: string, parent: string | null | undefined): Promise<void> {
    const current = ++request
    const body = { slug, locale, ...(source.id === 'new' ? {} : { id: source.id }), ...(parent === undefined ? {} : { parent }) }
    try {
      const result = await deps.api<PathPreview>(deps.capabilities.verbRoute(source.collection, 'previewPath'), { body })
      if (current === request) preview.value = result
    } catch {
      if (current === request) preview.value = null
    }
  }

  const stop = watch(
    () => [source.slug(), source.locale(), source.parent()] as const,
    ([slug, locale, parent]) => {
      clearTimeout(timer)
      if (!available || slug === '') {
        request++
        preview.value = null
        return
      }
      timer = setTimeout(() => { void load(slug, locale, parent) }, DEBOUNCE_MS)
    },
    { immediate: true },
  )

  onUnmounted(() => {
    stop()
    clearTimeout(timer)
    timer = undefined
  })

  const unreachable = computed(() => {
    const current = preview.value
    if (current === null || current.reachable || current.conflict !== null || !source.live()) return null
    return current.reason
  })

  return { preview, unreachable }
}
