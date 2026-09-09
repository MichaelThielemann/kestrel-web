import type { Provenance, ProvenanceOrigin } from '#kestrel-admin/types/api'

export const PROVENANCE_ORIGINS: ProvenanceOrigin[] = ['human', 'ai', 'mixed']

const ALL_ORIGINS: ProvenanceOrigin[] = [...PROVENANCE_ORIGINS, 'unknown']

export function provenanceOrigin(p: Provenance | null | undefined): ProvenanceOrigin {
  const origin = p?.origin
  return origin && ALL_ORIGINS.includes(origin) ? origin : 'unknown'
}

export function isDisclosed(p: Provenance | null | undefined): boolean {
  return provenanceOrigin(p) !== 'human'
}

export const provenanceLabelKey = (origin: ProvenanceOrigin): string => `media.provenance.${origin}`
