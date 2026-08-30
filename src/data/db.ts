import Dexie, { type EntityTable } from 'dexie'
import type { AppSetting, Comparison, FoodDraft, FoodEntry, RankGroup, ValidationEvent } from '../types'
import { createDemoData } from './demo'

export class FoodArchiveDB extends Dexie {
  entries!: EntityTable<FoodEntry, 'id'>
  rankGroups!: EntityTable<RankGroup, 'id'>
  comparisons!: EntityTable<Comparison, 'id'>
  drafts!: EntityTable<FoodDraft, 'id'>
  events!: EntityTable<ValidationEvent, 'id'>
  settings!: EntityTable<AppSetting, 'key'>

  constructor(name = 'food-life-archive') {
    super(name)
    this.version(1).stores({
      entries: 'id, createdAt, occurredAt, isDemo, rankStatus',
      rankGroups: 'id, order, createdAt',
      comparisons: 'id, leftEntryId, rightEntryId, createdAt',
      drafts: 'id, step',
      events: 'id, type, timestamp',
      settings: 'key',
    })
    this.version(2).stores({
      entries: 'id, createdAt, occurredAt, isDemo, rankStatus, board, cuisine, type, foodGroup, diet',
      rankGroups: 'id, [board+order], board, order, createdAt',
      comparisons: 'id, leftEntryId, rightEntryId, createdAt',
      drafts: 'id, step, targetBoard',
      events: 'id, type, timestamp',
      settings: 'key',
    }).upgrade(async (transaction) => {
      const entryTable = transaction.table<FoodEntry, string>('entries')
      const groupTable = transaction.table<RankGroup, string>('rankGroups')
      const entries = await entryTable.toArray()
      const groups = await groupTable.toArray()
      await groupTable.bulkPut(groups.map((group) => ({ ...group, board: group.board ?? 'red' })))
      const legacyBlack = entries.filter((entry) => entry.rankStatus === 'blacklisted').sort((a, b) => (a.blacklistOrder ?? 0) - (b.blacklistOrder ?? 0))
      await entryTable.bulkPut(entries.map((entry) => ({
        ...entry,
        aiName: entry.aiName ?? entry.name,
        board: entry.rankStatus === 'blacklisted' ? 'black' : entry.board,
        rankStatus: entry.rankStatus === 'blacklisted' ? 'ranked' : entry.rankStatus,
      })))
      await groupTable.bulkPut(legacyBlack.map((entry, order) => ({
        id: `rank-black-${entry.id}`,
        entryIds: [entry.id],
        board: 'black' as const,
        order,
        createdAt: entry.blacklistedAt ?? entry.createdAt,
      })))
    })
  }
}

export const db = new FoodArchiveDB()

export function friendlyStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'QuotaExceededError') return '本机存储空间不足，请删除部分记录后再试。'
  return '本地保存失败，请检查浏览器隐私模式或存储权限后重试。'
}

export async function completeOnboarding(mode: 'demo' | 'empty'): Promise<void> {
  await db.transaction('rw', db.entries, db.rankGroups, db.settings, async () => {
    if (mode === 'demo' && await db.entries.count() === 0) {
      const { entries, groups } = createDemoData()
      await db.entries.bulkAdd(entries)
      await db.rankGroups.bulkAdd(groups)
    }
    await db.settings.put({ key: 'onboardingCompleted', value: true })
  })
}

export async function resetAllData(): Promise<void> {
  await db.transaction('rw', [db.entries, db.rankGroups, db.comparisons, db.drafts, db.events, db.settings], async () => {
    await Promise.all([
      db.entries.clear(),
      db.rankGroups.clear(),
      db.comparisons.clear(),
      db.drafts.clear(),
      db.events.clear(),
      db.settings.clear(),
    ])
  })
}

export async function deleteEntry(entryId: string): Promise<void> {
  await db.transaction('rw', [db.entries, db.rankGroups, db.comparisons, db.drafts], async () => {
    await db.entries.delete(entryId)
    await db.comparisons.where('leftEntryId').equals(entryId).delete()
    await db.comparisons.where('rightEntryId').equals(entryId).delete()
    const groups = await db.rankGroups.orderBy('order').toArray()
    const survivors = groups
      .map((group) => ({ ...group, entryIds: group.entryIds.filter((id) => id !== entryId) }))
      .filter((group) => group.entryIds.length > 0)
    await db.rankGroups.clear()
    const boardOrders = { red: 0, black: 0 }
    await db.rankGroups.bulkPut(survivors.map((group) => {
      const board = group.board ?? 'red'
      return { ...group, board, order: boardOrders[board]++ }
    }))
    const draft = await db.drafts.get('active')
    if (draft?.entryId === entryId) await db.drafts.delete('active')
  })
}
