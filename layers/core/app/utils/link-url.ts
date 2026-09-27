/** The JSON Schema `pattern` a stored link target must match: an `http:`, `https:`, `mailto:` or `tel:` URL (any letter case), or a target relative to the site (`/…`, `#…`, `?…`). */
export const SAFE_LINK_URL_PATTERN = '^(?:[Hh][Tt][Tt][Pp][Ss]?:|[Mm][Aa][Ii][Ll][Tt][Oo]:|[Tt][Ee][Ll]:|[/#?])'

const SAFE_LINK_URL = new RegExp(SAFE_LINK_URL_PATTERN)

/**
 * The link target as a browser reads it (leading and trailing spaces and control characters dropped, tabs and line
 * breaks removed), or `null` when it is not an `http:`, `https:`, `mailto:` or `tel:` URL or a site-relative target.
 */
export function safeLinkUrl(url: string): string | null {
  // eslint-disable-next-line no-control-regex
  const normalized = url.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '')
  return SAFE_LINK_URL.test(normalized) ? normalized : null
}
