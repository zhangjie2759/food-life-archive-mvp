import type { AiSuggestion, AiSuggestionProvider } from '../types'
import { localDateKey } from '../lib/date'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取待识别图片。'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

export class MockAiSuggestionProvider implements AiSuggestionProvider {
  async analyze(file: File): Promise<AiSuggestion> {
    void file
    await new Promise((resolve) => setTimeout(resolve, 320))
    const occurredAt = localDateKey()
    return {
      providerLabel: 'AI 未连接 · 手动核准模式',
      fields: {
        name: '',
        aiName: '',
        location: '',
        cuisine: '未分类',
        type: '未分类',
        foodGroup: '未分类',
        diet: '不确定',
        tags: [],
        note: '',
        emotion: '待确认',
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
        location: '',
        cuisine: String(payload.cuisine || '未分类'),
        type: String(payload.type || '菜品'),
        foodGroup: String(payload.foodGroup || '其他'),
        diet: String(payload.diet || '不确定'),
        tags: [String(payload.foodGroup || '其他'), String(payload.diet || '不确定')],
        note: '',
        emotion: '待确认',
        occurredAt: localDateKey(),
      },
    }
  }
}

export const aiSuggestionProvider: AiSuggestionProvider = import.meta.env.VITE_USE_REAL_AI === 'true'
  ? new HttpAiSuggestionProvider(import.meta.env.VITE_AI_API_URL || '')
  : new MockAiSuggestionProvider()
