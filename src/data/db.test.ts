import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, completeOnboarding, deleteEntry, resetAllData } from './db'
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
    expect((await db.rankGroups.orderBy('order').toArray()).map((group) => group.order)).toEqual([0, 1, 2, 3, 4])
    await resetAllData()
    expect(await db.entries.count()).toBe(0)
    expect(await db.settings.count()).toBe(0)
  })
})
