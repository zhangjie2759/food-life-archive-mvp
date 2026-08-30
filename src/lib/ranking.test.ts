import { describe, expect, it } from 'vitest'
import { beginRanking, MAX_COMPARISONS, resolveComparison } from './ranking'

function finish(groups: string[], decisions: Array<'left' | 'right'>) {
  let result = beginRanking(groups)
  for (const decision of decisions) {
    if (result.kind !== 'continue') break
    result = resolveComparison(result.progress, groups, decision)
  }
  return result
}

describe('binary personal ranking', () => {
  it('inserts the first entry without asking a comparison', () => {
    expect(beginRanking([])).toEqual({ kind: 'insert', index: 0, comparisons: 0 })
  })

  it('places a stronger entry before all six demo groups in at most four comparisons', () => {
    const groups = ['a', 'b', 'c', 'd', 'e', 'f']
    const result = finish(groups, ['left', 'left', 'left', 'left'])
    expect(result).toEqual({ kind: 'insert', index: 0, comparisons: 2 })
  })

  it('places a weaker entry after all six demo groups in three comparisons', () => {
    const groups = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(finish(groups, ['right', 'right', 'right'])).toEqual({ kind: 'insert', index: 6, comparisons: 3 })
  })

  it('joins the anchor group when the user chooses a tie', () => {
    const start = beginRanking(['a', 'b', 'c'])
    expect(start.kind).toBe('continue')
    if (start.kind === 'continue') {
      expect(resolveComparison(start.progress, ['a', 'b', 'c'], 'tie')).toEqual({ kind: 'tie', groupId: 'b', comparisons: 1 })
    }
  })

  it('defers without counting a new effective comparison', () => {
    const start = beginRanking(['a', 'b'])
    if (start.kind === 'continue') {
      expect(resolveComparison(start.progress, ['a', 'b'], 'later')).toEqual({ kind: 'pending', comparisons: 0 })
    }
  })

  it('enforces the comparison ceiling for larger future lists', () => {
    const groups = Array.from({ length: 32 }, (_, index) => `g${index}`)
    const result = finish(groups, Array(MAX_COMPARISONS).fill('right'))
    expect(result.kind).toBe('insert')
    if (result.kind === 'insert') expect(result.comparisons).toBe(MAX_COMPARISONS)
  })
})
