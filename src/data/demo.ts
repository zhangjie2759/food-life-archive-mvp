import type { Emotion, FoodEntry, RankGroup } from '../types'

const base = import.meta.env.BASE_URL

const demoSeed: Array<{
  id: string
  image: string
  name: string
  location: string
  cuisine: string
  tags: string[]
  emotion: Emotion
  daysAgo: number
}> = [
  { id: 'demo-braised-pork', image: 'braised-pork.webp', name: '妈妈做的红烧肉', location: '家里', cuisine: '家常菜', tags: ['家的味道', '陪伴'], emotion: '怀念', daysAgo: 2 },
  { id: 'demo-sushi', image: 'sushi.webp', name: '东京那晚的寿司', location: '东京', cuisine: '日料', tags: ['旅行', '仪式感'], emotion: '惊喜', daysAgo: 5 },
  { id: 'demo-noodles', image: 'beef-noodles.webp', name: '老家牛肉面', location: '老家', cuisine: '面食', tags: ['熟悉', '热气腾腾'], emotion: '怀念', daysAgo: 8 },
  { id: 'demo-hotpot', image: 'hotpot.webp', name: '朋友局的成都火锅', location: '成都', cuisine: '川菜', tags: ['朋友', '热辣'], emotion: '满足', daysAgo: 12 },
  { id: 'demo-riceball', image: 'riceball.webp', name: '深夜便利店饭团', location: '街角便利店', cuisine: '便利店', tags: ['深夜', '陪伴'], emotion: '满足', daysAgo: 16 },
  { id: 'demo-tiramisu', image: 'tiramisu.webp', name: '甜到发苦的提拉米苏', location: '街角咖啡馆', cuisine: '甜点', tags: ['踩雷', '过甜'], emotion: '踩雷', daysAgo: 20 },
]

function isoDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

export function createDemoData(): { entries: FoodEntry[]; groups: RankGroup[] } {
  const entries = demoSeed.map((item) => {
    const createdAt = isoDaysAgo(item.daysAgo)
    const isBlack = item.id === 'demo-tiramisu'
    const classification: Record<string, { aiName: string; type: string; foodGroup: string; diet: string }> = {
      'demo-braised-pork': { aiName: '红烧肉', type: '菜品', foodGroup: '家常菜', diet: '荤' },
      'demo-sushi': { aiName: '握寿司', type: '主食', foodGroup: '寿司', diet: '荤' },
      'demo-noodles': { aiName: '牛肉面', type: '主食', foodGroup: '面食', diet: '荤' },
      'demo-hotpot': { aiName: '成都火锅', type: '菜品', foodGroup: '火锅', diet: '荤' },
      'demo-riceball': { aiName: '饭团', type: '主食', foodGroup: '米饭', diet: '素' },
      'demo-tiramisu': { aiName: '提拉米苏', type: '甜品', foodGroup: '蛋糕', diet: '素' },
    }
    return {
      ...item,
      ...classification[item.id],
      name: classification[item.id].aiName,
      image: `${base}demo/${item.image}`,
      occurredAt: createdAt.slice(0, 10),
      createdAt,
      updatedAt: createdAt,
      isDemo: true,
      rankStatus: 'ranked' as const,
      board: isBlack ? 'black' as const : 'red' as const,
      ...(isBlack ? { blacklistedAt: createdAt, blacklistOrder: 0 } : { bestowedName: item.name, bestowedAt: createdAt, lastRankChange: 'NEW' as const }),
    }
  })
  const nextOrder = { red: 0, black: 0 }
  const groups = entries.map((entry) => {
    const board = entry.board ?? 'red'
    return { id: `rank-${board}-${entry.id}`, entryIds: [entry.id], board, order: nextOrder[board]++, createdAt: entry.createdAt }
  })
  return { entries, groups }
}
