import { describe, expect, it } from 'vitest'
import { createValidationExport } from './export'
import type { ValidationEvent } from '../types'

describe('anonymous validation export', () => {
  it('uses a strict event whitelist and excludes personal content keys', () => {
    const events: ValidationEvent[] = [
      { id: 'secret-stable-id', type: 'record_saved', timestamp: '2026-08-30T00:00:00.000Z', elapsedMs: 42_000 },
      { id: 'ranked', type: 'ranking_completed', timestamp: '2026-08-30T00:00:30.000Z', comparisonCount: 3 },
      { id: 'another-id', type: 'ranking_deferred', timestamp: '2026-08-30T00:01:00.000Z', comparisonCount: 1 },
    ]
    const result = createValidationExport(events, new Date('2026-08-30T01:00:00.000Z'))
    const json = JSON.stringify(result)
    for (const forbidden of ['secret-stable-id', 'image', 'name', 'location', 'tags', 'notes', 'deviceId']) {
      expect(json).not.toContain(forbidden)
    }
    expect(result.summary).toMatchObject({ savedRecords: 1, completedRankings: 1, deferredRankings: 1, firstRecordMs: 42_000, medianComparisonCount: 3 })
  })

  it('exports only the first completed record time for cross-tester median analysis', () => {
    const events: ValidationEvent[] = [
      { id: 'later', type: 'record_saved', timestamp: '2026-08-30T00:02:00.000Z', elapsedMs: 18_000 },
      { id: 'first', type: 'record_saved', timestamp: '2026-08-30T00:01:00.000Z', elapsedMs: 55_000 },
    ]
    expect(createValidationExport(events).summary.firstRecordMs).toBe(55_000)
  })
})
