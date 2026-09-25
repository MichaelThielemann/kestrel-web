import type { MediaItem, MediaVariant } from '#kestrel-core/app/types/api'

/** The fields of an image variant a visitor may see. */
export type PublicMediaVariant = Pick<MediaVariant, 'size' | 'width' | 'height' | 'format' | 'path'>

/** The fields of a media item a visitor may see; what the public layer keeps in a page's data. */
export type PublicMediaItem = Pick<MediaItem, 'id' | 'path' | 'filename' | 'contentType' | 'size' | 'width' | 'height' | 'alt' | 'title' | 'description' | 'provenance'> & {
  variants: PublicMediaVariant[]
}

/** Reduces a media item to its public fields: no library folder, no timestamps, no variant counts, no variant state. */
export function toPublicMedia(item: MediaItem): PublicMediaItem {
  return {
    id: item.id,
    path: item.path,
    filename: item.filename,
    contentType: item.contentType,
    size: item.size,
    width: item.width,
    height: item.height,
    alt: item.alt,
    title: item.title,
    description: item.description,
    provenance: item.provenance,
    variants: item.variants.map((variant) => ({ size: variant.size, width: variant.width, height: variant.height, format: variant.format, path: variant.path })),
  }
}
