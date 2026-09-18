export interface BlockMarkerAttrs {
  role?: 'button'
  tabindex?: '0'
  'aria-pressed'?: 'true' | 'false'
}

export function blockMarkerAttrs(editable: boolean, selected: boolean): BlockMarkerAttrs {
  if (!editable) return {}
  return { role: 'button', tabindex: '0', 'aria-pressed': selected ? 'true' : 'false' }
}
