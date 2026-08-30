import type { AiSuggestion, AiSuggestionProvider, Emotion } from '../types'

const cuisines = ['家常菜', '中式', '日料', '西式', '街头小吃']
const emotions: Emotion[] = ['惊喜', '怀念', '满足']

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取待识别图片。'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

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
        aiName: '今天这道菜',
        location: '待补充地点',
        cuisine: cuisines[seed % cuisines.length],
        type: seed % 2 === 0 ? '菜品' : '主食',
        foodGroup: seed % 2 === 0 ? '家常菜' : '面食',
        diet: seed % 3 === 0 ? '素' : '荤',
        tags: ['今日记录', seed % 2 === 0 ? '温暖' : '新鲜感'],
        note: seed % 2 === 0 ? '刚入口时最打动我的，是熟悉又温暖的味道。' : '第一口有一点意外，值得吃完后再回来复判。',
        emotion: emotions[seed % emotions.length],
        occurredAt,
      },
    }
  }
}

export class HttpAiSuggestionProvider implements AiSuggestionProvider {
  constructor(private readonly baseUrl = '') {}

  async analyze(file: File): Promise<AiSuggestion> {
    const dataUrl = await readAsDataUrl(file)
    const [header, imageBase64] = dataUrl.split(',', 2)
    const mimeType = header.match(/^data:([^;]+);base64$/)?.[1]
    if (!mimeType || !imageBase64) throw new Error('无法准备 AI 图片识别请求。')
    const response = await fetch(`${this.baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType, imageBase64 }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'AI 图片识别暂时不可用。')
    const name = String(payload.name || '待确认食物')
    return {
      providerLabel: 'Gemini 真实图片识别',
      fields: {
        name,
        aiName: name,
        location: '待补充地点',
        cuisine: String(payload.cuisine || '未分类'),
        type: String(payload.type || '菜品'),
        foodGroup: String(payload.foodGroup || '其他'),
        diet: String(payload.diet || '不确定'),
        tags: [String(payload.foodGroup || '其他'), String(payload.diet || '不确定')],
        note: '',
        emotion: '满足',
        occurredAt: new Date().toISOString().slice(0, 10),
      },
    }
  }
}

export const aiSuggestionProvider: AiSuggestionProvider = import.meta.env.VITE_USE_REAL_AI === 'true'
  ? new HttpAiSuggestionProvider(import.meta.env.VITE_AI_API_URL || '')
  : new MockAiSuggestionProvider()
