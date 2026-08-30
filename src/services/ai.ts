import type { AiSuggestion, AiSuggestionProvider, Emotion } from '../types'

const cuisines = ['家常菜', '中式', '日料', '西式', '街头小吃']
const emotions: Emotion[] = ['惊喜', '怀念', '满足']

function checksum(value: string): number {
  return [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0)
}

export class MockAiSuggestionProvider implements AiSuggestionProvider {
  async analyze(file: File): Promise<AiSuggestion> {
    await new Promise((resolve) => setTimeout(resolve, 320))
    const seed = checksum(file.name || 'food')
    const occurredAt = new Date().toISOString().slice(0, 10)
    return {
      providerLabel: '验证版模拟识别',
      fields: {
        name: '今天这道菜',
        location: '待补充地点',
        cuisine: cuisines[seed % cuisines.length],
        tags: ['今日记录', seed % 2 === 0 ? '温暖' : '新鲜感'],
        emotion: emotions[seed % emotions.length],
        occurredAt,
      },
    }
  }
}

export const aiSuggestionProvider: AiSuggestionProvider = new MockAiSuggestionProvider()
