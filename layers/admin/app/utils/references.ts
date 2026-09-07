import type { ApiErrorDetails, ReferenceTo } from '#kestrel/types/api'

const ENTRY_RE = /([A-Za-z][\w-]*)\/([\w-]+)(?:\s*\(([^)]+)\))?/g

export function parseReferencedBy(message: string): ReferenceTo[] {
  const marker = message.indexOf('referenced')
  if (marker === -1) return []
  const tail = message.slice(marker)
  const entries: ReferenceTo[] = []
  for (const m of tail.matchAll(ENTRY_RE)) {
    const [, type, id, field] = m
    if (type === undefined || id === undefined) continue
    entries.push({ type, id, field: field ?? '' })
  }
  return entries
}

export function referencedBy(details: ApiErrorDetails | undefined, message: string): ReferenceTo[] {
  const referrers = details?.referrers
  if (Array.isArray(referrers) && referrers.length > 0) {
    return referrers.map((r) => ({ type: r.type, id: r.id, field: r.field ?? '' }))
  }
  return parseReferencedBy(message)
}
