export function exceedsUploadLimit(size: number, max: number | null): boolean {
  return max !== null && size > max
}
