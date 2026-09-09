import type { ReferenceTo } from '#kestrel-admin/types/api'
import { findCollection } from './collections'
import { recordTitle } from './record-title'

export function referrerKey(ref: ReferenceTo): string {
  return `${ref.type}/${ref.id}`
}

export function referrerLabel(ref: ReferenceTo, doc: Record<string, unknown> | null | undefined): string {
  const fields = findCollection(ref.type)?.fields
  const title = doc && fields ? recordTitle(fields, doc) : ''
  return title || referrerKey(ref)
}

export function referrerPath(ref: ReferenceTo): string {
  return `/admin/${ref.type}/${ref.id}`
}
