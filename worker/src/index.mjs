import { analyzeFoodImage } from '../../server/gemini.mjs'

const allowedOrigins = new Set([
  'https://zhangjie2759.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': allowedOrigins.has(origin) ? origin : 'https://zhangjie2759.github.io',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function json(status, body, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  })
}

export function createWorkerHandler(analyze = analyzeFoodImage) {
  const rateWindow = new Map()
  const rateLimited = (address) => {
    const now = Date.now()
    const record = rateWindow.get(address) ?? { startedAt: now, count: 0 }
    if (now - record.startedAt > 60_000) {
      record.startedAt = now
      record.count = 0
    }
    record.count += 1
    rateWindow.set(address, record)
    return record.count > 12
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url)
      const origin = request.headers.get('origin') || ''

      if (request.method === 'GET' && url.pathname === '/health') {
        return json(200, { ok: true, service: 'food-life-archive-ai', model: env.AI_MODEL || 'gemini-3.6-flash' }, origin)
      }
      if (!allowedOrigins.has(origin)) return json(403, { error: 'Origin not allowed' }, origin)
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
      if (request.method !== 'POST' || url.pathname !== '/api/analyze') return json(404, { error: 'Not found' }, origin)
      if (rateLimited(request.headers.get('cf-connecting-ip') || 'unknown')) return json(429, { error: '请求过于频繁，请稍后再试。' }, origin)

      const bodyText = await request.text()
      if (bodyText.length > 8 * 1024 * 1024) return json(413, { error: '图片过大，请重新拍摄或压缩后再试。' }, origin)
      try {
        const input = JSON.parse(bodyText)
        if (!input.imageBase64 || !String(input.mimeType).startsWith('image/')) return json(400, { error: '缺少有效图片。' }, origin)
        const result = await analyze({
          apiKey: env.AI_API_KEY,
          model: env.AI_MODEL || 'gemini-3.6-flash',
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
        })
        return json(200, result, origin)
      } catch (error) {
        return json(502, { error: error instanceof Error ? error.message : 'AI 识别失败。' }, origin)
      }
    },
  }
}

export default createWorkerHandler()
