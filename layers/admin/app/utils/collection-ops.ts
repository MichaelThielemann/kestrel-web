
import type { ReferenceTo } from '#kestrel-admin/types/api'

export interface BatchDeleteReport {
  count: number
  referencedCount: number
  referenced: { id: string; referrers: number }[]
  references: ReferenceTo[]
  checked: boolean
}

export function buildDeleteReport(ids: string[], referencesById: Map<string, ReferenceTo[]> = new Map(), checked = false, collection?: string): BatchDeleteReport {
  const deleting = new Set(ids)
  const external = (id: string) => (referencesById.get(id) ?? []).filter((r) => !(collection && r.type === collection && deleting.has(r.id)))
  const referenced = ids
    .map((id) => ({ id, referrers: external(id).length }))
    .filter((r) => r.referrers > 0)
  return {
    count: ids.length,
    referencedCount: referenced.length,
    referenced,
    references: ids.flatMap((id) => external(id)),
    checked,
  }
}
