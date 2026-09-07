
export function recordTitle(fields: Record<string, { type: string }>, values: Record<string, unknown>): string {
  const entries = Object.entries(fields)
  const pick = entries.find(([k, f]) => k === 'title' && f.type === 'text') ?? entries.find(([, f]) => f.type === 'text')
  if (!pick) return ''
  const v = values[pick[0]]
  return typeof v === 'string' ? v.trim() : ''
}
