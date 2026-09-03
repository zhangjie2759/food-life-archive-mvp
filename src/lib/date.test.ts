import { describe, expect, it } from 'vitest'
import { localDateKey, localMonthKey } from './date'

describe('local calendar keys', () => {
  it('uses the device calendar date instead of a UTC slice', () => {
    const afterLocalMidnight = new Date(2026, 8, 1, 0, 5, 0)
    expect(localDateKey(afterLocalMidnight)).toBe('2026-09-01')
    expect(localMonthKey(afterLocalMidnight)).toBe('2026-09')
  })

  it('pads single-digit month and day values', () => {
    expect(localDateKey(new Date(2026, 0, 2, 12))).toBe('2026-01-02')
  })
})
