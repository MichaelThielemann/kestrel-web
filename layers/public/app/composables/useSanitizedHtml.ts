import type { MaybeRefOrGetter } from 'vue'
import DOMPurify from 'dompurify'
import { sanitizedHtmlKey } from '../sanitized-html-key'

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'span', 'div',
]
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel', 'data-kestrel-broken'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  '*': ['id', 'class', 'lang', 'dir'],
}
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel', 'kestrel']
const URI_PATTERN = /^(?:(?:https?|mailto|tel|kestrel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const RESERVED_IDS = new Set(['teleports', 'site-main'])

/**
 * Whether rich text may keep this `id`: the backend sanitizer's rule (an ASCII letter, then up to 63 ASCII letters,
 * digits, `-` or `_`), minus the ids the site's own markup and Nuxt use (`teleports`, `site-main`, anything starting
 * with `nuxt`), compared without regard to letter case.
 */
export function isAllowedContentId(id: string): boolean {
  const lower = id.toLowerCase()
  return ID_PATTERN.test(id) && !RESERVED_IDS.has(lower) && !lower.startsWith('nuxt')
}

function purify(html: string): string {
  const fragment = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [...new Set(Object.values(ALLOWED_ATTRS).flat())], ALLOWED_URI_REGEXP: URI_PATTERN, RETURN_DOM_FRAGMENT: true })
  for (const element of fragment.querySelectorAll('[id]')) {
    if (!isAllowedContentId(element.getAttribute('id') ?? '')) element.removeAttribute('id')
  }
  const container = document.createElement('div')
  container.append(fragment)
  return container.innerHTML
}

export async function sanitizeOnServer(html: string): Promise<string> {
  const { default: sanitizeHtml } = await import('sanitize-html')
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, attribs) => ({ tagName, attribs: attribs.id === undefined || isAllowedContentId(attribs.id) ? attribs : Object.fromEntries(Object.entries(attribs).filter(([name]) => name !== 'id')) }),
    },
  })
}

export function sanitizeInBrowser(html: string): Promise<string> {
  if (!DOMPurify.isSupported) {
    return Promise.reject(new Error('sanitizeInBrowser: DOMPurify is not supported in this environment'))
  }
  return Promise.resolve(purify(html))
}

/** The part of the Nuxt app `cachedSanitizedHtml` reads. */
export interface SanitizedHtmlCache {
  isHydrating?: boolean
  payload: { data: Record<string, unknown> }
  static: { data: Record<string, unknown> }
}

/**
 * `getCachedData` for `useSanitizedHtml()`: reads the cached value where Nuxt's default does (the payload while
 * hydrating, the static cache otherwise) and, in the browser, sanitizes it again before it is rendered. A value the
 * sanitizer leaves as it is comes back as the same string, so hydration sees the markup the server rendered.
 */
export function cachedSanitizedHtml(key: string, nuxtApp: SanitizedHtmlCache, ctx: { cause: string }): string | undefined {
  const cached: unknown = nuxtApp.isHydrating ? nuxtApp.payload.data[key] : ctx.cause !== 'refresh:manual' && ctx.cause !== 'refresh:hook' ? nuxtApp.static.data[key] : undefined
  if (typeof cached !== 'string') return undefined
  if (!import.meta.client || !DOMPurify.isSupported) return cached
  const clean = purify(cached)
  const probe = document.createElement('template')
  probe.innerHTML = cached
  return probe.innerHTML === clean ? cached : clean
}

export function useSanitizedHtml(source: MaybeRefOrGetter<string>) {
  return useAsyncData(() => sanitizedHtmlKey(toValue(source)), () => (import.meta.server ? sanitizeOnServer(toValue(source)) : sanitizeInBrowser(toValue(source))), {
    watch: [() => toValue(source)],
    default: () => '',
    getCachedData: (key, nuxtApp, ctx) => cachedSanitizedHtml(key, nuxtApp, ctx),
  })
}
