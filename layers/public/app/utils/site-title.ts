export const DEFAULT_TITLE_SEPARATOR = '·'

export type TitlePosition = 'prefix' | 'suffix'

export function siteTitleTemplate(siteTitle: string | null | undefined, separator?: string | null, position?: string | null) {
  const glue = ` ${(separator ?? '').trim() || DEFAULT_TITLE_SEPARATOR} `
  const parts = (title?: string | null) => (position === 'prefix' ? [siteTitle, title] : [title, siteTitle])
  return (title?: string | null) => parts(title).filter(Boolean).join(glue)
}
