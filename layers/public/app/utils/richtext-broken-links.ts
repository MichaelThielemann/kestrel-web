

const BROKEN_ANCHOR = /<a\b[^>]*\sdata-kestrel-broken="[^"]*"[^>]*>([\s\S]*?)<\/a>/g

export function stripBrokenPageLinks(html: string): string {
  return html.replace(BROKEN_ANCHOR, '$1')
}
