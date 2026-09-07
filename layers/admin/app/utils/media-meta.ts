export interface MediaMetaLoaded {
  alt: string | null
  title: string | null
  description: string | null
}

export interface MediaMetaCurrent {
  alt: string
  title: string
  description: string
}

export type MediaMetaFields = Partial<{ alt: string | null, title: string | null, description: string | null }>

export function changedMetaFields(loaded: MediaMetaLoaded, current: MediaMetaCurrent): MediaMetaFields {
  const fields: MediaMetaFields = {}
  for (const key of ['alt', 'title', 'description'] as const) {
    const before = (loaded[key] ?? '').trim()
    const after = current[key].trim()
    if (after === before) continue
    fields[key] = after === '' ? null : after
  }
  return fields
}
