import type { MaybeRefOrGetter } from 'vue'

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

export async function sanitizeOnServer(html: string): Promise<string> {
  const { default: sanitizeHtml } = await import('sanitize-html')
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
  })
}

export async function sanitizeInBrowser(html: string): Promise<string> {
  const { default: DOMPurify } = await import('dompurify')
  if (!DOMPurify.isSupported) {
    throw new Error('sanitizeInBrowser: DOMPurify is not supported in this environment')
  }
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [...new Set(Object.values(ALLOWED_ATTRS).flat())], ALLOWED_URI_REGEXP: URI_PATTERN })
}

function hashSource(value: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hash53 = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return hash53.toString(36)
}

export function sanitizedHtmlKey(source: string): string {
  return `sanitized:${source.length}:${hashSource(source)}`
}

export function useSanitizedHtml(source: MaybeRefOrGetter<string>) {
  return useAsyncData(() => sanitizedHtmlKey(toValue(source)), () => (import.meta.server ? sanitizeOnServer(toValue(source)) : sanitizeInBrowser(toValue(source))), {
    watch: [() => toValue(source)],
    default: () => '',
  })
}
