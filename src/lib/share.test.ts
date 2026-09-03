import { describe, expect, it } from 'vitest'
import { buildRankingShareModel } from './share'
import type { FoodEntry } from '../types'

describe('ranking share model', () => {
  it('uses notes first and limits the public image to Top 10', () => {
    const entries = Array.from({ length: 12 }, (_, index): FoodEntry => ({
      id: String(index), image: '', name: `味道 ${index + 1}`, location: '本地', cuisine: '测试', tags: ['标签'],
      note: index === 0 ? '我自己的备注' : '', emotion: '满足', occurredAt: '2026-08-30', createdAt: '2026-08-30T00:00:00.000Z', isDemo: false, rankStatus: 'ranked',
    }))
    const model = buildRankingShareModel(entries, '月榜', '2026.08')
    expect(model.rows).toHaveLength(10)
    expect(model.rows[0]).toMatchObject({ rank: 1, note: '我自己的备注' })
    expect(model.rows[1].note).toBe('标签')
  })

  it('labels blacklist exports as a personal experience instead of a public rating', () => {
    const entry: FoodEntry = {
      id: 'bad-1', image: '', name: '踩雷的一餐', location: '本地', cuisine: '测试', tags: ['踩雷'],
      note: '只代表这一次体验', emotion: '踩雷', occurredAt: '2026-08-30', createdAt: '2026-08-30T00:00:00.000Z', isDemo: false,
      rankStatus: 'blacklisted', blacklistedAt: '2026-08-30T00:00:00.000Z', blacklistOrder: 0,
    }
    const model = buildRankingShareModel([entry], '黑榜', '人生避雷')
    expect(model.title).toBe('我的黑榜')
    expect(model.subtitle).toContain('仅代表个人口味与单次体验')
  })
})
