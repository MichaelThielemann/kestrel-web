/** The site path a URL path stands for: `/about/` and `/about` are both `/about`; the home page stays `/`. A file path such as `/about/index.html` stays as it is. */
export function sitePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}
