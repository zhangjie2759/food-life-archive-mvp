import { describe, expect, it, vi } from 'vitest'
import { HttpAiSuggestionProvider, MockAiSuggestionProvider } from './ai'

describe('MockAiSuggestionProvider', () => {
  it('returns clearly labeled editable suggestion fields without making a request', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const promise = new MockAiSuggestionProvider().analyze(new File(['food'], 'lunch.jpg', { type: 'image/jpeg' }))
    await vi.advanceTimersByTimeAsync(400)
    const suggestion = await promise
    expect(suggestion.providerLabel).toBe('AI 未连接 · 手动核准模式')
    expect(suggestion.fields).toMatchObject({ name: '', location: '', cuisine: '未分类', emotion: '待确认' })
    expect(Array.isArray(suggestion.fields.tags)).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    vi.useRealTimers()
  })

  it('maps the server-side Gemini response into editable objective classifications', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      name: '牛肉面', cuisine: '西北菜', type: '主食', foodGroup: '面食', diet: '荤',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const suggestion = await new HttpAiSuggestionProvider('https://api.example.test').analyze(new File(['food'], 'noodles.webp', { type: 'image/webp' }))
    expect(suggestion.providerLabel).toBe('Gemini 真实图片识别')
    expect(suggestion.fields).toMatchObject({ name: '牛肉面', aiName: '牛肉面', cuisine: '西北菜', type: '主食', foodGroup: '面食', diet: '荤' })
    expect(fetchSpy).toHaveBeenCalledWith('https://api.example.test/api/analyze', expect.objectContaining({ method: 'POST' }))
    fetchSpy.mockRestore()
  })
})
