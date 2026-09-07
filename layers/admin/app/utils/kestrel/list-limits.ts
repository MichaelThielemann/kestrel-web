

export const PER_PAGE_OPTIONS = [25, 50, 100, 250, 500] as const

export const DEFAULT_PER_PAGE = 25

export const MAX_PER_PAGE = 500

export function clampPerPage(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return DEFAULT_PER_PAGE
  return Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(v)))
}

export const MAX_BULK_IDS = MAX_PER_PAGE
