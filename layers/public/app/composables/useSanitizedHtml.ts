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

async function sanitizeOnServer(html: string): Promise<string> {
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

async function sanitizeInBrowser(html: string): Promise<string> {
  const { default: DOMPurify } = await import('dompurify')
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [...new Set(Object.values(ALLOWED_ATTRS).flat())], ALLOWED_URI_REGEXP: URI_PATTERN })
}

export function useSanitizedHtml(source: MaybeRefOrGetter<string>) {
  return useAsyncData(`sanitized:${useId()}`, () => (import.meta.server ? sanitizeOnServer(toValue(source)) : sanitizeInBrowser(toValue(source))), {
    watch: [() => toValue(source)],
    default: () => '',
  })
}
