export type Emotion = '惊喜' | '怀念' | '满足' | '踩雷'
export type RankStatus = 'ranking' | 'ranked' | 'pending'
export type ComparisonResult = 'left' | 'right' | 'tie' | 'later'

export interface FoodEntry {
  id: string
  image: string
  name: string
  location: string
  cuisine: string
  tags: string[]
  emotion: Emotion
  occurredAt: string
  createdAt: string
  isDemo: boolean
  rankStatus: RankStatus
}

export interface RankGroup {
  id: string
  entryIds: string[]
  order: number
  createdAt: string
}

export interface Comparison {
  id: string
  leftEntryId: string
  rightEntryId: string
  result: ComparisonResult
  anchorGroupId: string
  round: number
  createdAt: string
}

export type ValidationEventType =
  | 'onboarding_completed'
  | 'record_started'
  | 'photo_selected'
  | 'suggestion_ready'
  | 'entry_confirmed'
  | 'comparison_completed'
  | 'ranking_completed'
  | 'ranking_deferred'
  | 'ranking_viewed'

export interface ValidationEvent {
  id: string
  type: ValidationEventType
  timestamp: string
  elapsedMs?: number
  comparisonCount?: number
}

export interface FoodDraftFields {
  name: string
  location: string
  cuisine: string
  tags: string[]
  emotion: Emotion
  occurredAt: string
}

export interface RankingProgress {
  lower: number
  upper: number
  round: number
  anchorGroupId?: string
}

export interface FoodDraft {
  id: 'active'
  step: 'form' | 'compare'
  image: string
  fields: FoodDraftFields
  startedAt: string
  entryId?: string
  ranking?: RankingProgress
}

export interface AppSetting {
  key: string
  value: string | boolean | number
}

export interface AiSuggestion {
  providerLabel: '验证版模拟识别'
  fields: FoodDraftFields
}

export interface AiSuggestionProvider {
  analyze(file: File): Promise<AiSuggestion>
}

export interface ValidationExportV1 {
  schemaVersion: 1
  exportedAt: string
  summary: {
    eventCount: number
    completedRankings: number
    deferredRankings: number
    firstRecordMs: number | null
    medianComparisonCount: number | null
  }
  events: Array<Pick<ValidationEvent, 'type' | 'timestamp' | 'elapsedMs' | 'comparisonCount'>>
}
