import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { FoodArchiveDB, db, completeOnboarding, deleteEntry, resetAllData } from './db'
import type { FoodDraft } from '../types'

describe('IndexedDB persistence', () => {
  beforeEach(async () => {
    await resetAllData()
  })
  afterEach(async () => {
    await resetAllData()
  })

  it('seeds six explicit demo records and restores a saved draft', async () => {
    await completeOnboarding('demo')
    expect(await db.entries.count()).toBe(6)
    expect((await db.entries.toArray()).every((entry) => entry.isDemo)).toBe(true)
    const draft: FoodDraft = {
      id: 'active', step: 'form', image: 'data:image/webp;base64,dGVzdA==', startedAt: new Date().toISOString(),
      fields: { name: '测试菜', location: '家', cuisine: '家常菜', tags: ['测试'], emotion: '满足', occurredAt: '2026-08-30' },
    }
    await db.drafts.put(draft)
    expect(await db.drafts.get('active')).toEqual(draft)
  })

  it('deletes an entry and repairs group order, then clears everything', async () => {
    await completeOnboarding('demo')
    const first = await db.entries.toCollection().first()
    expect(first).toBeDefined()
    await deleteEntry(first!.id)
    expect(await db.entries.get(first!.id)).toBeUndefined()
    const groups = await db.rankGroups.toArray()
    const redOrders = groups.filter((group) => (group.board ?? 'red') === 'red').sort((a, b) => a.order - b.order).map((group) => group.order)
    const blackOrders = groups.filter((group) => group.board === 'black').sort((a, b) => a.order - b.order).map((group) => group.order)
    expect(redOrders).toEqual([0, 1, 2, 3])
    expect(blackOrders).toEqual([0])
    await resetAllData()
    expect(await db.entries.count()).toBe(0)
    expect(await db.settings.count()).toBe(0)
  })

  it('migrates a legacy blacklisted entry into an independent black ranking', async () => {
    const databaseName = `food-life-migration-${Date.now()}`
    const legacy = new Dexie(databaseName)
    legacy.version(1).stores({
      entries: 'id, createdAt, occurredAt, isDemo, rankStatus',
      rankGroups: 'id, order, createdAt', comparisons: 'id', drafts: 'id', events: 'id', settings: 'key',
    })
    await legacy.open()
    await legacy.table('entries').put({
      id: 'legacy-bad', image: '', name: '旧黑榜记录', location: '本地', cuisine: '测试', tags: [], emotion: '踩雷', occurredAt: '2026-08-30', createdAt: '2026-08-30T00:00:00.000Z', isDemo: false, rankStatus: 'blacklisted', blacklistOrder: 0,
    })
    legacy.close()
    const upgraded = new FoodArchiveDB(databaseName)
    await upgraded.open()
    expect(await upgraded.entries.get('legacy-bad')).toMatchObject({ rankStatus: 'ranked', board: 'black', aiName: '旧黑榜记录' })
    expect(await upgraded.rankGroups.where('board').equals('black').count()).toBe(1)
    upgraded.close()
    await Dexie.delete(databaseName)
  })

  it('migrates bestowed names without losing the standard name', async () => {
    const databaseName = `food-life-v3-migration-${Date.now()}`
    const legacy = new Dexie(databaseName)
    legacy.version(2).stores({
      entries: 'id, createdAt, occurredAt, isDemo, rankStatus, board, cuisine, type, foodGroup, diet',
      rankGroups: 'id, [board+order], board, order, createdAt', comparisons: 'id', drafts: 'id', events: 'id', settings: 'key',
    })
    await legacy.open()
    await legacy.table('entries').put({
      id: 'named-food', image: '', name: '凌晨两点救命牛肉面', aiName: '牛肉面', bestowedName: '凌晨两点救命牛肉面',
      location: '本地', cuisine: '西北菜', tags: [], emotion: '满足', occurredAt: '2026-08-30', createdAt: '2026-08-30T00:00:00.000Z', isDemo: false, rankStatus: 'ranked', board: 'red',
    })
    legacy.close()
    const upgraded = new FoodArchiveDB(databaseName)
    await upgraded.open()
    expect(await upgraded.entries.get('named-food')).toMatchObject({ name: '牛肉面', aiName: '牛肉面', bestowedName: '凌晨两点救命牛肉面', updatedAt: '2026-08-30T00:00:00.000Z' })
    upgraded.close()
    await Dexie.delete(databaseName)
  })
})
