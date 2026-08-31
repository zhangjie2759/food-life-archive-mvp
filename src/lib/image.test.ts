import { describe, expect, it } from 'vitest'
import { calculateSquareCropRegion, cropOffsetLimits } from './image'

describe('square image crop', () => {
  it('centers a square crop inside a landscape image', () => {
    const region = calculateSquareCropRegion({
      naturalWidth: 1600,
      naturalHeight: 900,
      viewportSize: 320,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    })
    expect(region.sourceX).toBeCloseTo(350)
    expect(region.sourceY).toBeCloseTo(0)
    expect(region.sourceSize).toBeCloseTo(900)
  })

  it('uses zoom to isolate a smaller dish area', () => {
    const region = calculateSquareCropRegion({
      naturalWidth: 1600,
      naturalHeight: 900,
      viewportSize: 320,
      zoom: 2,
      offsetX: 0,
      offsetY: 0,
    })
    expect(region.sourceX).toBeCloseTo(575)
    expect(region.sourceY).toBeCloseTo(225)
    expect(region.sourceSize).toBeCloseTo(450)
  })

  it('clamps dragging so the crop never contains blank pixels', () => {
    const limits = cropOffsetLimits(1600, 900, 320, 1)
    const region = calculateSquareCropRegion({
      naturalWidth: 1600,
      naturalHeight: 900,
      viewportSize: 320,
      zoom: 1,
      offsetX: limits.x + 500,
      offsetY: limits.y + 500,
    })
    expect(region.sourceX).toBeCloseTo(0)
    expect(region.sourceY).toBeCloseTo(0)
  })
})
