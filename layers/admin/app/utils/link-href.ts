import type { LinkValue } from '#kestrel-admin/types/kestrel'

export function linkHref(link: LinkValue | null): string | null {
  if (!link) return null
  switch (link.type) {
    case 'internal': return `/admin/${link.collection}/${link.id}`
    case 'external': return link.url
    case 'email': return `mailto:${link.email}`
    case 'tel': return `tel:${link.tel}`
  }
}
