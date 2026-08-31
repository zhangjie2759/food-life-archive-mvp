import { describe, expect, it, vi } from 'vitest'
import { createWorkerHandler } from './index.mjs'

const origin = 'https://zhangjie2759.github.io'

describe('Gemini Cloudflare Worker', () => {
  it('accepts the Pages origin and returns objective food fields', async () => {
    const analyze = vi.fn().mockResolvedValue({ name: '牛肉面', cuisine: '西北菜', type: '主食', foodGroup: '面食', diet: '荤' })
    const worker = createWorkerHandler(analyze)
    const response = await worker.fetch(new Request('https://worker.example/api/analyze', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ mimeType: 'image/webp', imageBase64: 'dGVzdA==' }),
    }), { AI_API_KEY: 'test-secret', AI_MODEL: 'test-model' })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(await response.json()).toMatchObject({ name: '牛肉面', foodGroup: '面食' })
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-secret', model: 'test-model' }))
  })

  it('rejects unapproved origins before processing the image', async () => {
    const analyze = vi.fn()
    const worker = createWorkerHandler(analyze)
    const response = await worker.fetch(new Request('https://worker.example/api/analyze', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType: 'image/webp', imageBase64: 'dGVzdA==' }),
    }), { AI_API_KEY: 'test-secret' })
    expect(response.status).toBe(403)
    expect(analyze).not.toHaveBeenCalled()
  })

  it('exposes a secret-free health endpoint', async () => {
    const worker = createWorkerHandler(vi.fn())
    const response = await worker.fetch(new Request('https://worker.example/health'), {})
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, service: 'food-life-archive-ai' })
  })
})
