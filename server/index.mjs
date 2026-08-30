import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { analyzeFoodImage } from './gemini.mjs'

async function readLocalEnvironment() {
  try {
    const content = await readFile(resolve('server/.env.local'), 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
    }
  } catch {
    // Production hosts provide environment variables directly.
  }
}

await readLocalEnvironment()
const port = Number(process.env.PORT || 8787)
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://zhangjie2759.github.io',
])
const rateWindow = new Map()

function corsHeaders(origin) {
  const allowedOrigin = allowedOrigins.has(origin) ? origin : 'http://localhost:5173'
  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
  }
}

function send(response, status, body, origin = '') {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) })
  response.end(JSON.stringify(body))
}

function rateLimited(address) {
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

createServer(async (request, response) => {
  const origin = request.headers.origin || ''
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(origin))
    response.end()
    return
  }
  if (request.method !== 'POST' || request.url !== '/api/analyze') {
    send(response, 404, { error: 'Not found' }, origin)
    return
  }
  if (!allowedOrigins.has(origin)) {
    send(response, 403, { error: 'Origin not allowed' }, origin)
    return
  }
  if (rateLimited(request.socket.remoteAddress || 'unknown')) {
    send(response, 429, { error: '请求过于频繁，请稍后再试。' }, origin)
    return
  }
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > 8 * 1024 * 1024) {
      send(response, 413, { error: '图片过大，请重新拍摄或压缩后再试。' }, origin)
      return
    }
    chunks.push(chunk)
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!input.imageBase64 || !String(input.mimeType).startsWith('image/')) {
      send(response, 400, { error: '缺少有效图片。' }, origin)
      return
    }
    const result = await analyzeFoodImage({
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gemini-3.6-flash',
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    })
    send(response, 200, result, origin)
  } catch (error) {
    send(response, 502, { error: error instanceof Error ? error.message : 'AI 识别失败。' }, origin)
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Gemini proxy listening on http://127.0.0.1:${port}\n`)
})
