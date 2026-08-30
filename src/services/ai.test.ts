import { describe, expect, it, vi } from 'vitest'
import { MockAiSuggestionProvider } from './ai'

describe('MockAiSuggestionProvider', () => {
  it('returns clearly labeled editable suggestion fields without making a request', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const promise = new MockAiSuggestionProvider().analyze(new File(['food'], 'lunch.jpg', { type: 'image/jpeg' }))
    await vi.advanceTimersByTimeAsync(400)
    const suggestion = await promise
    expect(suggestion.providerLabel).toBe('验证版模拟识别')
    expect(suggestion.fields).toMatchObject({ name: expect.any(String), location: expect.any(String), cuisine: expect.any(String) })
    expect(Array.isArray(suggestion.fields.tags)).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    vi.useRealTimers()
  })
})
