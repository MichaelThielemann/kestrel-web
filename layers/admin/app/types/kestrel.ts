export * from '../../../core/app/types/kestrel'

export interface SeoMeta {
  title?: string
  description?: string
  noindex?: boolean
  image?: string | null
  author?: string
  publishedDate?: string
  keywords?: string
}
