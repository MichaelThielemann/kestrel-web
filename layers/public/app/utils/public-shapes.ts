import type { AnonymousOf, PageDocument, PublicPageDocument, PublicSiteResponse, SiteResponse } from '#kestrel-core/app/types/api'
import { withoutBlockAliases } from '#kestrel-core/app/utils/block-privacy'

/** The fields of a media item a visitor may see, as the API answers a caller without a session; what the public layer keeps in a page's data. */
export type PublicMediaItem = AnonymousOf<'getMedia'>

/** The fields of an image variant a visitor may see. */
export type PublicMediaVariant = PublicMediaItem['variants'][number]

/** A media answer for any caller: the anonymous fields, and variants only when the images feature adds them. */
export type MediaAnswer = Omit<PublicMediaItem, 'variants'> & { variants?: readonly PublicMediaVariant[] }

/** Reduces a media item to its public fields: no library folder, no timestamps, no variant counts, no variant state; an item without variants gets an empty list. */
export function toPublicMedia(item: MediaAnswer): PublicMediaItem {
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
    variants: (item.variants ?? []).map((variant) => ({ size: variant.size, width: variant.width, height: variant.height, format: variant.format, path: variant.path })),
  }
}

/** Reduces a page to what a caller without a session receives: everything but its timestamps, and every block's editor-only alias. */
export function toPublicPage(page: PageDocument | PublicPageDocument): PublicPageDocument {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = page
  return { ...rest, body: rest.body === null ? null : withoutBlockAliases(rest.body) }
}

function isPageAnswer(response: SiteResponse | PublicSiteResponse): response is PageDocument | PublicPageDocument {
  return 'id' in response
}

/** `toPublicPage` for a page answer of `/site/*`; a redirect hit passes through. */
export function toPublicSiteResponse(response: SiteResponse | PublicSiteResponse): PublicSiteResponse {
  return isPageAnswer(response) ? toPublicPage(response) : response
}
