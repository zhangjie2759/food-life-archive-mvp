import type { ValidationEvent, ValidationExportV1 } from '../types'

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function createValidationExport(events: ValidationEvent[], now = new Date()): ValidationExportV1 {
  const safeEvents = events.map(({ type, timestamp, elapsedMs, comparisonCount }) => ({
    type,
    timestamp,
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
    ...(comparisonCount === undefined ? {} : { comparisonCount }),
  }))
  const completed = safeEvents.filter((event) => event.type === 'ranking_completed')
  const firstCompleted = [...completed].sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0]
  return {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    summary: {
      eventCount: safeEvents.length,
      completedRankings: completed.length,
      deferredRankings: safeEvents.filter((event) => event.type === 'ranking_deferred').length,
      firstRecordMs: firstCompleted?.elapsedMs ?? null,
      medianComparisonCount: median(completed.flatMap((event) => event.comparisonCount === undefined ? [] : [event.comparisonCount])),
    },
    events: safeEvents,
  }
}
