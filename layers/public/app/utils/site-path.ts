/** The site path a URL path stands for: `/about/`, `/about/index.html` and `/about` are all `/about`; the home page stays `/`. */
export function sitePath(path: string): string {
  const trimmed = path.replace(/\/index\.html$/, '/').replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}
