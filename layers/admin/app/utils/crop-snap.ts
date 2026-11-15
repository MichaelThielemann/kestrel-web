/** How close, in screen pixels, the dragged crop has to come to a guide before it snaps to it. */
export const SNAP_DISTANCE = 8

const EDGE_TOLERANCE = 1e-6

/** The lines of the frame the focus snaps to, as fractions of the frame: the thirds and the middle. */
export const SNAP_LINES: readonly number[] = [1 / 3, 1 / 2, 2 / 3]

/** A line of the frame the crop snapped to: vertical on axis `x`, horizontal on axis `y`, at a fraction of the frame, and whether the middle of the image or the centre of the focus snapped to it. */
export interface SnapGuide {
  axis: 'x' | 'y'
  at: number
  kind: 'image' | 'focus'
}

/** The admin catalog key that names what snapped to a guide. */
export type SnapLabelKey = 'cropFrame.snap.image' | 'cropFrame.snap.focus' | 'cropFrame.snap.focusThird'

/** The catalog key naming what snapped to the guide: the middle of the image, the centre of the focus, or the focus on a third of the frame. */
export function snapLabelKey(guide: SnapGuide): SnapLabelKey {
  if (guide.kind === 'image') return 'cropFrame.snap.image'
  return Math.abs(guide.at - 1 / 2) < EDGE_TOLERANCE ? 'cropFrame.snap.focus' : 'cropFrame.snap.focusThird'
}

/** What the snapping of one crop position depends on, every length in pixels of the oriented image. */
export interface SnapScene {
  width: number
  height: number
  cropWidth: number
  cropHeight: number
  focus: { x: number, y: number } | null
  threshold: number
}

/** The centre of the crop after snapping, and the guides it snapped to. */
export interface SnapResult {
  cx: number
  cy: number
  guides: SnapGuide[]
}

/** The snap distance in image pixels for a crop `cropWidth` image pixels wide that the frame shows `frameWidth` screen pixels wide; 0 when the frame has no width. */
export function snapThreshold(cropWidth: number, frameWidth: number): number {
  return frameWidth > 0 && cropWidth > 0 ? (SNAP_DISTANCE * cropWidth) / frameWidth : 0
}

interface SnapCandidate {
  centre: number
  at: number
  kind: SnapGuide['kind']
}

function snapAxis(centre: number, size: number, span: number, focus: number | null, threshold: number): SnapCandidate | null {
  if (size - span <= 2 + EDGE_TOLERANCE) return null
  const candidates: SnapCandidate[] = [{ centre: size / 2, at: 1 / 2, kind: 'image' }]
  if (focus !== null) for (const at of SNAP_LINES) candidates.push({ centre: focus + (1 / 2 - at) * span, at, kind: 'focus' })
  let best: SnapCandidate | null = null
  for (const candidate of candidates) {
    if (candidate.centre < span / 2 - EDGE_TOLERANCE || candidate.centre > size - span / 2 + EDGE_TOLERANCE) continue
    const distance = Math.abs(candidate.centre - centre)
    if (distance > threshold) continue
    if (best === null || distance < Math.abs(best.centre - centre)) best = candidate
  }
  return best
}

/**
 * The crop centre `(cx, cy)` snapped per axis to the nearest guide within the threshold: the middle of the image to
 * the middle of the frame, and the centre of the focus to the middle and the thirds of the frame. A guide the crop
 * could only reach by leaving the image is skipped, so the result stays inside the image wherever the input was. An
 * axis that leaves the crop at most two pixels of room never snaps: a crop that close to the centred one is stored as
 * centred, so it cannot move there.
 */
export function snapCentre(cx: number, cy: number, scene: SnapScene): SnapResult {
  const guides: SnapGuide[] = []
  const x = snapAxis(cx, scene.width, scene.cropWidth, scene.focus?.x ?? null, scene.threshold)
  const y = snapAxis(cy, scene.height, scene.cropHeight, scene.focus?.y ?? null, scene.threshold)
  if (x) guides.push({ axis: 'x', at: x.at, kind: x.kind })
  if (y) guides.push({ axis: 'y', at: y.at, kind: y.kind })
  return { cx: x?.centre ?? cx, cy: y?.centre ?? cy, guides }
}
