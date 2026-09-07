

export const RICHTEXT_LINK_SCHEME = 'kestrel'

const MARKER_HREF = new RegExp(`href="${RICHTEXT_LINK_SCHEME}:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)"`, 'g')
const MARKER_VALUE = new RegExp(`^${RICHTEXT_LINK_SCHEME}:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$`)

export function richtextLinkHref(collection: string, id: string): string {
  return `${RICHTEXT_LINK_SCHEME}:${collection}:${id}`
}

export function parseRichtextLinkHref(href: string | null | undefined): { collection: string; id: string } | null {
  if (typeof href !== 'string') return null
  const m = href.match(MARKER_VALUE)
  return m ? { collection: m[1]!, id: m[2]! } : null
}

export function collectRichtextRefs(html: string | null | undefined): { collection: string; id: string }[] {
  if (!html) return []
  return [...html.matchAll(MARKER_HREF)].map((m) => ({ collection: m[1]!, id: m[2]! }))
}

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

export function resolveRichtextLinks(
  html: string | null | undefined,
  resolveHref: (collection: string, id: string) => string | null,
): string {
  if (typeof html !== 'string' || !html) return ''
  return html.replace(MARKER_HREF, (_m, collection: string, id: string) =>
    `href="${escapeAttr(resolveHref(collection, id) ?? '#')}"`)
}
