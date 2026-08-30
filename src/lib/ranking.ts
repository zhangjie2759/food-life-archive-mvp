import type { ComparisonResult, RankingProgress } from '../types'

export const MAX_COMPARISONS = 4

export type RankingResolution =
  | { kind: 'continue'; progress: RankingProgress; anchorIndex: number }
  | { kind: 'insert'; index: number; comparisons: number }
  | { kind: 'tie'; groupId: string; comparisons: number }
  | { kind: 'pending'; comparisons: number }

export function beginRanking(groupIds: string[]): RankingResolution {
  if (groupIds.length === 0) return { kind: 'insert', index: 0, comparisons: 0 }
  const anchorIndex = Math.floor((groupIds.length - 1) / 2)
  return {
    kind: 'continue',
    anchorIndex,
    progress: {
      lower: 0,
      upper: groupIds.length - 1,
      round: 0,
      anchorGroupId: groupIds[anchorIndex],
    },
  }
}

export function resolveComparison(
  progress: RankingProgress,
  groupIds: string[],
  result: ComparisonResult,
): RankingResolution {
  if (!progress.anchorGroupId) throw new Error('缺少比较锚点。')
  const anchorIndex = groupIds.indexOf(progress.anchorGroupId)
  if (anchorIndex < 0) throw new Error('比较锚点已失效，请重新开始排名。')

  if (result === 'later') return { kind: 'pending', comparisons: progress.round }
  const comparisons = progress.round + 1
  if (result === 'tie') return { kind: 'tie', groupId: progress.anchorGroupId, comparisons }

  const lower = result === 'left' ? progress.lower : anchorIndex + 1
  const upper = result === 'left' ? anchorIndex - 1 : progress.upper

  if (lower > upper || comparisons >= MAX_COMPARISONS) {
    return { kind: 'insert', index: lower, comparisons }
  }

  const nextAnchorIndex = Math.floor((lower + upper) / 2)
  return {
    kind: 'continue',
    anchorIndex: nextAnchorIndex,
    progress: {
      lower,
      upper,
      round: comparisons,
      anchorGroupId: groupIds[nextAnchorIndex],
    },
  }
}
