

export function isValidSort(sort: string, validKeys: ReadonlySet<string>): boolean {
  const base = sort.startsWith('-') ? sort.slice(1) : sort
  return validKeys.has(base)
}

export function toggleSort(current: string, field: string): string {
  return current === field ? `-${field}` : field
}

export function sortDirection(current: string, field: string): 'asc' | 'desc' | null {
  if (current === field) return 'asc'
  if (current === `-${field}`) return 'desc'
  return null
}
