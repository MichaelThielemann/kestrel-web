import type { MaybeRefOrGetter } from 'vue'
import DOMPurify from 'dompurify'
import {
  HTML_ALLOWED_ATTRIBUTES,
  HTML_ALLOWED_SCHEMES,
  HTML_ALLOWED_TAGS,
  HTML_ID_PATTERN,
  HTML_IMG_SCHEMES,
  normalizeHtmlAttributes,
} from '@michaelthielemann/kestrel-contracts/helpers/html-allowlist'
import { sanitizedHtmlKey } from '../sanitized-html-key'

const RESERVED_IDS = new Set(['teleports', 'site-main'])

const ALLOWED_TAGS = [...HTML_ALLOWED_TAGS]
const ALLOWED_ATTR = [...new Set(Object.values(HTML_ALLOWED_ATTRIBUTES).flat())]
const ALLOWED_URI_REGEXP = new RegExp(`^(?:(?:${[...new Set([...HTML_ALLOWED_SCHEMES, ...HTML_IMG_SCHEMES])].join('|')}):|[^a-z]|[a-z+.-]+(?:[^a-z+.\\-:]|$))`, 'i')

function attributesAllowedOn(tagName: string): ReadonlySet<string> {
  return new Set([...(HTML_ALLOWED_ATTRIBUTES[tagName] ?? []), ...(HTML_ALLOWED_ATTRIBUTES['*'] ?? [])])
}

/**
 * Whether rich text may keep this `id`: the backend sanitizer's rule (an ASCII letter, then up to 63 ASCII letters,
 * digits, `-` or `_`), minus the ids the site's own markup and Nuxt use (`teleports`, `site-main`, anything starting
 * with `nuxt`), compared without regard to letter case.
 */
export function isAllowedContentId(id: string): boolean {
  const lower = id.toLowerCase()
  return HTML_ID_PATTERN.test(id) && !RESERVED_IDS.has(lower) && !lower.startsWith('nuxt')
}

function enforceAllowlist(element: Element): void {
  const tag = element.tagName.toLowerCase()
  const allowed = attributesAllowedOn(tag)
  const attribs = Object.fromEntries(Array.from(element.attributes, (attribute) => [attribute.name, attribute.value]))
  const normalized = normalizeHtmlAttributes(tag, attribs)
  for (const name of Object.keys(attribs)) {
    if (!allowed.has(name) || !(name in normalized) || (name === 'id' && !isAllowedContentId(normalized[name] ?? ''))) element.removeAttribute(name)
  }
  if (tag === 'a' && normalized.rel !== undefined && normalized.rel !== attribs.rel) element.setAttribute('rel', normalized.rel)
}

function purify(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP,
    RETURN_DOM_FRAGMENT: true,
  })
  for (const element of fragment.querySelectorAll('*')) enforceAllowlist(element)
  const container = document.createElement('div')
  container.append(fragment)
  return container.innerHTML
}

function trimAttributeValues(attribs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(attribs).map(([name, value]) => [name, value.trim()]))
}

export async function sanitizeOnServer(html: string): Promise<string> {
  const { default: sanitizeHtml } = await import('sanitize-html')
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: Object.fromEntries(Object.entries(HTML_ALLOWED_ATTRIBUTES).map(([tag, names]) => [tag, [...names]])),
    allowedSchemes: [...HTML_ALLOWED_SCHEMES],
    allowedSchemesByTag: { img: [...HTML_IMG_SCHEMES] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, attribs) => {
        const normalized = normalizeHtmlAttributes(tagName, trimAttributeValues(attribs))
        const { id, ...rest } = normalized
        return { tagName, attribs: id === undefined || isAllowedContentId(id) ? normalized : rest }
      },
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
