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
  { id: 'demo-tiramisu', image: 'tiramisu.webp', name: '雨天的提拉米苏', location: '街角咖啡馆', cuisine: '甜点', tags: ['雨天', '治愈'], emotion: '惊喜', daysAgo: 20 },
]

function isoDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

export function createDemoData(): { entries: FoodEntry[]; groups: RankGroup[] } {
  const entries = demoSeed.map((item) => {
    const createdAt = isoDaysAgo(item.daysAgo)
    return {
      ...item,
      image: `${base}demo/${item.image}`,
      occurredAt: createdAt.slice(0, 10),
      createdAt,
      isDemo: true,
      rankStatus: 'ranked' as const,
    }
  })
  const groups = entries.map((entry, index) => ({
    id: `rank-${entry.id}`,
    entryIds: [entry.id],
    order: index,
    createdAt: entry.createdAt,
  }))
  return { entries, groups }
}
