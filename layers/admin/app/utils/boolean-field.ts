
export function nextBooleanValue(current: boolean | undefined, incoming: string | string[] | null): boolean | undefined {
  if (incoming === 'true') return true
  if (incoming === 'false') return false
  return current
}
