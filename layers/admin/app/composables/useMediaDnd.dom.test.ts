import { describe, expect, it } from 'vitest'
import { hoveredFolder } from './useMediaDnd'

function folderIconTarget(): SVGPathElement {
  const folder = document.createElement('div')
  folder.setAttribute('data-drop-folder', '/photos')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  svg.appendChild(path)
  folder.appendChild(svg)
  document.body.appendChild(folder)
  return path
}

describe('hoveredFolder', () => {
  it('resolves the folder path when the pointer is over an SVG icon inside the tile', () => {
    const svgTarget = folderIconTarget()

    expect(hoveredFolder({ target: svgTarget })).toBe('/photos')
  })

  it('returns null when the pointer is outside any drop target', () => {
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    expect(hoveredFolder({ target: outside })).toBeNull()
  })
})
