import type { BlockNode, PageDocument, PageSeo } from '../../../core/app/types/api'

export const PREVIEW_PREFIX = 'kestrel:preview:'

export interface PreviewDocument {
  id: string
  slug: string | null
  title: string | null
  body: BlockNode[] | null
  seo: PageSeo | null
  layout: string | null
  [field: string]: unknown
}

export interface PreviewSnapshot {
  document: PreviewDocument
  locale: string
  updatedAt: number
}

export function buildPreviewDocument(
  base: Pick<PreviewDocument, 'id' | 'slug' | 'title' | 'body' | 'seo' | 'layout'>,
  fieldNames: string[],
  values: Record<string, unknown>,
): PreviewDocument {
  const document: PreviewDocument = { ...base }
  for (const name of fieldNames) document[name] = values[name]
  return document
}

export function previewPageDocument(document: PreviewDocument, updatedAt: number): PageDocument {
  return { ...document, status: null, shareImage: null, createdAt: 0, updatedAt }
}

export function previewKey(pageId: string | null | undefined): string {
  const trimmed = (pageId ?? '').trim()
  return trimmed || 'new'
}

export function previewStorageKey(key: string): string {
  return `${PREVIEW_PREFIX}${key}`
}

export function previewChannelName(key: string): string {
  return `${PREVIEW_PREFIX}${key}`
}

export function previewTabPath(key: string): string {
  return `/_preview/${key}`
}

export function publishPreview(key: string, snapshot: PreviewSnapshot): void {
  if (typeof window === 'undefined') return
  let serialized: string
  try {
    serialized = JSON.stringify(snapshot)
  } catch {
    return
  }
  try {
    window.sessionStorage.setItem(previewStorageKey(key), serialized)
  } catch {
    return
  }
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(previewChannelName(key))
  channel.postMessage(serialized)
  channel.close()
}

export function readPreviewSnapshot(key: string): PreviewSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(previewStorageKey(key))
    return raw ? (JSON.parse(raw) as PreviewSnapshot) : null
  } catch {
    return null
  }
}

export function subscribePreview(key: string, onUpdate: (snapshot: PreviewSnapshot) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const channel = new BroadcastChannel(previewChannelName(key))
  const handler = (e: MessageEvent<string>) => {
    try {
      onUpdate(JSON.parse(e.data) as PreviewSnapshot)
    } catch {
      return
    }
  }
  channel.addEventListener('message', handler)
  return () => {
    channel.removeEventListener('message', handler)
    channel.close()
  }
}
