const DEFAULT_MODEL = 'gemini-3.6-flash'

const responseSchema = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: '自然、常见、简短的中文食物名称' },
    cuisine: { type: 'STRING', description: '菜系，例如川菜、粤菜、日料、西餐或家常菜' },
    type: { type: 'STRING', description: '主食、点心、甜品、小吃或菜品之一' },
    food_group: { type: 'STRING', description: '面食、米饭、火锅、烧烤、寿司等食物类别' },
    diet: { type: 'STRING', description: '荤、素或不确定之一' },
  },
  required: ['name', 'cuisine', 'type', 'food_group', 'diet'],
}

export async function analyzeFoodImage({ apiKey, model = DEFAULT_MODEL, imageBase64, mimeType }) {
  if (!apiKey) throw new Error('服务端缺少 AI_API_KEY。')
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: '识别照片中最主要的一道食物。只做客观命名和基础分类，不评价好吃或难吃。名称使用自然、常见、简短的中文；不确定时使用最可能的上位类别。' },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
      },
    }),
  })
  if (!response.ok) {
    const safeStatus = `${response.status} ${response.statusText}`.trim()
    throw new Error(`Gemini 图片识别失败（${safeStatus}）。`)
  }
  const payload = await response.json()
  const text = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text
  if (!text) throw new Error('Gemini 没有返回可用的识别结果。')
  const result = JSON.parse(text)
  return {
    name: String(result.name || '待确认食物'),
    cuisine: String(result.cuisine || '未分类'),
    type: String(result.type || '菜品'),
    foodGroup: String(result.food_group || '其他'),
    diet: String(result.diet || '不确定'),
  }
}
