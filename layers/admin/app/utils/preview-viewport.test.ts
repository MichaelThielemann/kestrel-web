import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clampDim, fitScale, matchPreset, resolveDim, PRESETS } from './preview-viewport'

const blockPreviewSource = readFileSync(resolve(process.cwd(), 'layers/admin/app/components/BlockPreview.vue'), 'utf-8')

describe('fitScale', () => {
  it('caps at 100% and never depends on availH for an auto device height', () => {
    expect(fitScale(3000, 500, 1440, 'auto')).toBe(1)
    expect(fitScale(3000, 999_999, 1440, 'auto')).toBe(1)
    expect(fitScale(1000, 500, 1440, 'auto')).toBeCloseTo(1000 / 1440)
    expect(fitScale(1000, 999_999, 1440, 'auto')).toBeCloseTo(1000 / 1440)
  })

  it('fits both dimensions when height is a fixed number, never upscaling', () => {
    expect(fitScale(768, 1024, 768, 1024)).toBe(1)
    expect(fitScale(384, 1024, 768, 1024)).toBeCloseTo(0.5)
    expect(fitScale(768, 512, 768, 1024)).toBeCloseTo(0.5)
  })
})

describe('resolveDim', () => {
  it('returns the fixed dimension unchanged', () => {
    expect(resolveDim(2000, 1024, 0.5, 999)).toBe(1024)
  })

  it('derives an auto dimension from the available space and scale', () => {
    expect(resolveDim(1000, 'auto', 0.5, 999)).toBe(2000)
  })

  it('falls back when there is nothing to measure yet', () => {
    expect(resolveDim(0, 'auto', 1, 640)).toBe(640)
    expect(resolveDim(1000, 'auto', 0, 640)).toBe(640)
  })
})

describe('matchPreset / clampDim', () => {
  it('matches an exact preset and falls back to custom', () => {
    const presets = PRESETS(1440)
    expect(matchPreset(1440, 'auto', presets)).toBe('desktop')
    expect(matchPreset(1440, 900, presets)).toBe('custom')
  })

  it('clamps and floors', () => {
    expect(clampDim(100, 320, 3840)).toBe(320)
    expect(clampDim(500.9, 320, 3840)).toBe(500)
    expect(clampDim(null, 320, 3840)).toBeNull()
  })
})

function simulateStageWidth(measureWidth: (overflowing: boolean) => number, deviceWidth: number, availH: number, frames: number) {
  const seen: number[] = []
  let overflowing = false
  for (let i = 0; i < frames; i += 1) {
    const availW = measureWidth(overflowing)
    const scale = fitScale(availW, availH, deviceWidth, 'auto')
    const canvasH = resolveDim(availH, 'auto', scale, availH)
    overflowing = canvasH * scale > availH
    seen.push(availW)
  }
  return seen
}

describe('the preview stage measurement contract', () => {
  const DEVICE_WIDTH = 1440
  const RAW_WIDTH = 1430
  const SCROLLBAR_WIDTH = 16
  const AVAIL_H = 820

  it('never settles when the measured width shrinks under its own computed overflow', () => {
    const widthThatReactsToOverflow = (overflowing: boolean) => (overflowing ? RAW_WIDTH - SCROLLBAR_WIDTH : RAW_WIDTH)
    const seen = simulateStageWidth(widthThatReactsToOverflow, DEVICE_WIDTH, AVAIL_H, 40)
    const tail = seen.slice(-10)
    const distinctValuesInTail = new Set(tail)
    const alternatesEveryFrame = tail.every((v, i) => i === 0 || v !== tail[i - 1])

    expect(distinctValuesInTail.size).toBeGreaterThan(1)
    expect(alternatesEveryFrame).toBe(true)
  })

  it('settles immediately when the measured width does not react to overflow', () => {
    const stableWidth = () => RAW_WIDTH
    const seen = simulateStageWidth(stableWidth, DEVICE_WIDTH, AVAIL_H, 40)

    expect(new Set(seen).size).toBe(1)
  })
})

describe('the preview stage scroll container', () => {
  it('reserves the scrollbar gutter so its measured width cannot depend on overflow', () => {
    expect(blockPreviewSource).toMatch(/&__stage\s*{[^}]*scrollbar-gutter:\s*stable/)
  })
})
