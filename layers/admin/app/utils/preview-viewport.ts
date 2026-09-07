import type { IconName } from '#kestrel/utils/icons'

export type Dim = number | 'auto'

export interface ViewportPreset {
  key: 'desktop' | 'tablet' | 'mobile'

  icon: IconName

  label: string

  w: Dim
  h: Dim
}

export type PresetKey = ViewportPreset['key'] | 'custom'

export const DIM_MIN = 320
export const WIDTH_MAX = 3840
export const HEIGHT_MAX = 4320

export function PRESETS(desktopWidth: number): ViewportPreset[] {
  return [
    { key: 'desktop', icon: 'monitor', label: 'preview.device.desktop', w: desktopWidth, h: 'auto' },
    { key: 'tablet', icon: 'tablet', label: 'preview.device.tablet', w: 768, h: 1024 },
    { key: 'mobile', icon: 'smartphone', label: 'preview.device.mobile', w: 390, h: 844 },
  ]
}

export function matchPreset(w: Dim, h: Dim, presets: ViewportPreset[]): PresetKey {
  return presets.find((p) => p.w === w && p.h === h)?.key ?? 'custom'
}

export function fitScale(availW: number, availH: number, w: Dim, h: Dim): number {
  const ratios = [1]
  if (typeof w === 'number' && w > 0 && availW > 0) ratios.push(availW / w)
  if (typeof h === 'number' && h > 0 && availH > 0) ratios.push(availH / h)
  return Math.min(...ratios)
}

export function resolveDim(avail: number, dim: Dim, scale: number, fallback: number): number {
  if (dim !== 'auto') return dim
  return avail > 0 && scale > 0 ? Math.round(avail / scale) : fallback
}

export function clampDim(n: number | null | undefined, min: number, max: number): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, Math.floor(n)))
}
