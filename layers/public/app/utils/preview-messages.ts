export type PreviewMessage =
  | { type: 'kestrel-preview:select'; id: string | null }
  | { type: 'kestrel-preview:selected'; id: string | null }
  | { type: 'kestrel-preview:ready' }

export function selectMessage(id: string | null): PreviewMessage {
  return { type: 'kestrel-preview:select', id }
}

export function selectedMessage(id: string | null): PreviewMessage {
  return { type: 'kestrel-preview:selected', id }
}

export function readyMessage(): PreviewMessage {
  return { type: 'kestrel-preview:ready' }
}

function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  switch (v.type) {
    case 'kestrel-preview:select':
    case 'kestrel-preview:selected':
      return v.id === null || typeof v.id === 'string'
    case 'kestrel-preview:ready':
      return true
    default:
      return false
  }
}

export function parsePreviewMessage(event: MessageEvent, expectedOrigin: string): PreviewMessage | null {
  if (event.origin !== expectedOrigin) return null
  return isPreviewMessage(event.data) ? event.data : null
}
