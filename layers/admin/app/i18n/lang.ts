export function pickLang(available: readonly string[], preferred: readonly string[]): string {
  const known = new Map(available.map((l) => [l.toLowerCase(), l]))
  for (const tag of preferred) {
    const lower = tag.toLowerCase()
    const exact = known.get(lower)
    if (exact !== undefined) return exact
    const base = known.get(lower.split('-')[0] ?? '')
    if (base !== undefined) return base
  }
  return available[0] ?? 'en'
}

export function langLabel(lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'language', fallback: 'none' }).of(lang) ?? lang.toUpperCase()
  } catch {
    return lang.toUpperCase()
  }
}
