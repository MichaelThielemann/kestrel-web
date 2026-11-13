import type { AnonymousOf, PageDocument, PublicPageDocument, PublicSiteResponse, SiteResponse } from '#kestrel-core/app/types/api'

type AnonymousMediaItem = AnonymousOf<'getMedia'>

type AnonymousMediaVariant = AnonymousMediaItem['variants'][number]

/** The fields of an image variant a visitor may see; `crop` is missing when a project's own anonymous media grant leaves `variants[].crop` out. */
export type PublicMediaVariant = Omit<AnonymousMediaVariant, 'crop'> & { crop?: AnonymousMediaVariant['crop'] }

/** The fields of a media item a visitor may see, as the API answers a caller without a session; what the public layer keeps in a page's data. */
export type PublicMediaItem = Omit<AnonymousMediaItem, 'variants'> & { variants: PublicMediaVariant[] }

/** A media item `KestrelImage` and `pickImageSources` take: the public fields, with the focus optional. */
export type ImageMedia = Omit<PublicMediaItem, 'focus'> & { focus?: PublicMediaItem['focus'] }

/** A media answer for any caller: the anonymous fields, and the focus and variants only when the images feature adds them. */
export type MediaAnswer = Omit<PublicMediaItem, 'variants' | 'focus'> & { variants?: readonly PublicMediaVariant[]; focus?: PublicMediaItem['focus'] }

/** Reduces a media item to its public fields: no library folder, no timestamps, no variant counts, no variant state, no framing; an item without variants gets an empty list, one without a focus a `null` focus, and a variant keeps its `crop` when the answer carries it. */
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
    focus: item.focus ?? null,
    variants: (item.variants ?? []).map((variant) => ({
      size: variant.size,
      width: variant.width,
      height: variant.height,
      format: variant.format,
      path: variant.path,
      ...(variant.crop === undefined ? {} : { crop: variant.crop }),
    })),
  }
}

/** Reduces a page to what a caller without a session receives: everything but its timestamps. */
export function toPublicPage(page: PageDocument | PublicPageDocument): PublicPageDocument {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = page
  return rest
}

function isPageAnswer(response: SiteResponse | PublicSiteResponse): response is PageDocument | PublicPageDocument {
  return 'id' in response
}

/** `toPublicPage` for a page answer of `/site/*`; a redirect hit passes through. */
export function toPublicSiteResponse(response: SiteResponse | PublicSiteResponse): PublicSiteResponse {
  return isPageAnswer(response) ? toPublicPage(response) : response
}
