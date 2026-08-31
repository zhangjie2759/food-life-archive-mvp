export type Emotion = '惊喜' | '怀念' | '满足' | '踩雷' | '待确认'
export type RankStatus = 'ranking' | 'ranked' | 'pending' | 'blacklisted'
export type RankingBoard = 'red' | 'black'
export type ComparisonResult = 'left' | 'right' | 'tie' | 'later'

export interface FoodEntry {
  id: string
  image: string
  name: string
  aiName?: string
  bestowedName?: string
  location: string
  cuisine: string
  type?: string
  foodGroup?: string
  diet?: string
  tags: string[]
  note?: string
  emotion: Emotion
  occurredAt: string
  createdAt: string
  isDemo: boolean
  rankStatus: RankStatus
  board?: RankingBoard
  bestowedAt?: string
  lastRankChange?: number | 'NEW'
  blacklistedAt?: string
  blacklistOrder?: number
}

export interface RankGroup {
  id: string
  entryIds: string[]
  order: number
  board?: RankingBoard
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
  | 'photo_cropped'
  | 'suggestion_ready'
  | 'entry_confirmed'
  | 'record_saved'
  | 'comparison_completed'
  | 'ranking_completed'
  | 'ranking_deferred'
  | 'ranking_viewed'
  | 'name_bestowed'
  | 'board_selected'

export interface ValidationEvent {
  id: string
  type: ValidationEventType
  timestamp: string
  elapsedMs?: number
  comparisonCount?: number
}

export interface FoodDraftFields {
  name: string
  aiName?: string
  location: string
  cuisine: string
  type?: string
  foodGroup?: string
  diet?: string
  tags: string[]
  note?: string
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
  targetBoard?: RankingBoard
  providerLabel?: string
}

export interface AppSetting {
  key: string
  value: string | boolean | number
}

export interface AiSuggestion {
  providerLabel: string
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
    savedRecords: number
    completedRankings: number
    deferredRankings: number
    firstRecordMs: number | null
    medianComparisonCount: number | null
  }
  events: Array<Pick<ValidationEvent, 'type' | 'timestamp' | 'elapsedMs' | 'comparisonCount'>>
}
