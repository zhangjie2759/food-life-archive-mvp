import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { completeOnboarding, db, resetAllData } from './data/db'
import type { FoodEntry, RankGroup } from './types'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

describe('record to ranking flow', () => {
  beforeEach(async () => {
    window.location.hash = '#/record'
    await resetAllData()
    await completeOnboarding('demo')
    await db.drafts.put({
      id: 'active', step: 'form', image: 'data:image/webp;base64,dGVzdA==', startedAt: new Date(Date.now() - 10_000).toISOString(),
      fields: { name: '模拟菜名', location: '模拟地点', cuisine: '家常菜', tags: ['测试'], emotion: '满足', occurredAt: '2026-08-30' },
    })
  })
  afterEach(async () => {
    cleanup()
    await resetAllData()
  })

  it('saves first, then starts pairwise review from the ranking home', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByTestId('draft-resume')).toBeInTheDocument()
    await user.click(screen.getByText('继续完成'))
    const input = await screen.findByTestId('food-name')
    await user.clear(input)
    await user.type(input, '雨天小馆的煲仔饭')
    await user.click(screen.getByTestId('confirm-entry'))
    expect(await screen.findByTestId('completion-card')).toHaveTextContent('记录在册')
    expect((await db.entries.get((await db.entries.filter((entry) => entry.name === '雨天小馆的煲仔饭').first())!.id))?.rankStatus).toBe('pending')
    await user.click(screen.getByTestId('view-ranking'))
    await user.click(await screen.findByRole('button', { name: '列入红榜雨天小馆的煲仔饭' }))
    await screen.findByTestId('comparison-view')
    for (let round = 0; round < 4 && screen.queryByTestId('choose-new'); round += 1) {
      await user.click(screen.getByTestId('choose-new'))
      await act(async () => undefined)
    }
    expect(await screen.findByTestId('ranking-ceremony')).toHaveTextContent('榜首易主')
    await user.click(screen.getByTestId('ranking-ceremony').querySelector('button')!)
    expect(await screen.findByTestId('period-ranking')).toHaveTextContent('雨天小馆的煲仔饭')
    expect(await db.entries.filter((entry) => entry.name === '雨天小馆的煲仔饭').count()).toBe(1)
  })

  it('keeps an item pending when review is deferred', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('继续完成'))
    fireEvent.click(await screen.findByTestId('confirm-entry'))
    fireEvent.click(await screen.findByTestId('view-ranking'))
    fireEvent.click(await screen.findByRole('button', { name: '列入红榜模拟菜名' }))
    fireEvent.click(await screen.findByTestId('choose-later'))
    expect(await screen.findByTestId('completion-card')).toHaveTextContent('记录在册')
    fireEvent.click(screen.getByTestId('view-ranking'))
    expect(await screen.findByTestId('pending-list')).toHaveTextContent('模拟菜名')
  })

  it('does not let a delayed form autosave resurrect a saved draft', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('继续完成'))
    const input = await screen.findByTestId('food-name')
    fireEvent.change(input, { target: { value: '快速确认的一餐' } })
    fireEvent.click(screen.getByTestId('confirm-entry'))
    expect(await screen.findByTestId('completion-card')).toBeInTheDocument()
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 220)) })
    expect(await db.drafts.get('active')).toBeUndefined()
    expect((await db.entries.filter((entry) => entry.name === '快速确认的一餐').first())?.rankStatus).toBe('pending')
  })

  it('ranks a pending record independently in the black list', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('继续完成'))
    const input = await screen.findByTestId('food-name')
    await user.clear(input)
    await user.type(input, '难吃到想吐槽的一餐')
    await user.click(screen.getByTestId('confirm-entry'))
    await user.click(await screen.findByTestId('view-ranking'))
    await user.click(await screen.findByRole('button', { name: '列入黑榜难吃到想吐槽的一餐' }))
    await user.click(await screen.findByTestId('choose-new'))
    expect(await screen.findByTestId('ranking-ceremony')).toHaveTextContent('最差纪录刷新')
    await user.click(screen.getByTestId('ranking-ceremony').querySelector('button')!)
    await user.click(screen.getByTestId('board-black'))
    expect(await screen.findByTestId('period-ranking')).toHaveTextContent('难吃到想吐槽的一餐')
    const entry = await db.entries.filter((item) => item.name === '难吃到想吐槽的一餐').first()
    expect(entry?.rankStatus).toBe('ranked')
    expect(entry?.board).toBe('black')
  })

  it('grants a Top 10 entry a ceremonial personal name while preserving its AI name', async () => {
    window.location.hash = '#/ranking'
    const user = userEvent.setup()
    render(<App />)
    const buttons = await screen.findAllByRole('button', { name: '重新定名' })
    await user.click(buttons[0])
    const input = await screen.findByLabelText('正式赐名')
    await user.clear(input)
    await user.type(input, '正式册封的红烧肉')
    await user.click(screen.getByRole('button', { name: '确认定名' }))
    const entry = await db.entries.filter((item) => item.name === '正式册封的红烧肉').first()
    expect(entry?.bestowedName).toBe('正式册封的红烧肉')
    expect(entry?.aiName).toBe('红烧肉')
  })
})

describe('first launch', () => {
  beforeEach(async () => {
    window.location.hash = '#/record'
    await resetAllData()
  })
  afterEach(async () => {
    cleanup()
    await resetAllData()
  })

  it('shows onboarding instead of an endless loading state on an empty database', async () => {
    render(<App />)
    expect(await screen.findByTestId('onboarding')).toBeInTheDocument()
    expect(screen.getByText('空白开始')).toBeInTheDocument()
  })

  it('starts validation timing when the user opens the photo picker', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('空白开始'))
    expect(await screen.findByTestId('ranking-page')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '记录' }))
    await waitFor(async () => {
      expect(await db.events.where('type').equals('record_started').count()).toBe(1)
    })
  })
})

describe('derived monthly ranking', () => {
  beforeEach(async () => {
    window.location.hash = '#/ranking'
    await resetAllData()
    await completeOnboarding('empty')
    const currentMonth = new Date().toISOString().slice(0, 7)
    const entries: FoodEntry[] = Array.from({ length: 11 }, (_, index) => ({
      id: `food-${index}`,
      image: 'data:image/webp;base64,dGVzdA==',
      name: index === 10 ? '人生榜外的本月新味道' : `旧味道 ${index + 1}`,
      location: '测试地点',
      cuisine: '测试菜系',
      tags: ['测试'],
      emotion: '满足',
      occurredAt: index === 10 ? `${currentMonth}-01` : '2025-01-01',
      createdAt: new Date().toISOString(),
      isDemo: false,
      rankStatus: 'ranked',
    }))
    const groups: RankGroup[] = entries.map((entry, order) => ({ id: `rank-${order}`, entryIds: [entry.id], order, createdAt: new Date().toISOString() }))
    await db.entries.bulkAdd(entries)
    await db.rankGroups.bulkAdd(groups)
  })
  afterEach(async () => {
    cleanup()
    await resetAllData()
  })

  it('derives the month ranking from the full life ranking, not only the former Top 10', async () => {
    render(<App />)
    expect(await screen.findByTestId('period-ranking')).toHaveTextContent('人生榜外的本月新味道')
  })
})

describe('live camera entry', () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  const originalPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play')
  const stop = vi.fn()
  const getUserMedia = vi.fn()

  beforeEach(async () => {
    window.location.hash = '#/record'
    await resetAllData()
    await completeOnboarding('empty')
    stop.mockReset()
    getUserMedia.mockReset()
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
  })

  afterEach(async () => {
    cleanup()
    await resetAllData()
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
    else Reflect.deleteProperty(navigator, 'mediaDevices')
    if (originalPlay) Object.defineProperty(HTMLMediaElement.prototype, 'play', originalPlay)
  })

  it('opens the environment camera as the primary recording flow and stops it on close', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByTestId('start-record'))
    expect(await screen.findByTestId('camera-screen')).toBeInTheDocument()
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
    })))
    await user.click(screen.getByLabelText('关闭摄像头'))
    expect(screen.queryByTestId('camera-screen')).not.toBeInTheDocument()
    expect(stop).toHaveBeenCalled()
  })

  it('stops a camera stream that resolves after the user has already closed the viewfinder', async () => {
    let resolveCamera!: (stream: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => { resolveCamera = resolve }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByTestId('start-record'))
    expect(await screen.findByTestId('camera-screen')).toBeInTheDocument()
    await user.click(screen.getByLabelText('关闭摄像头'))
    resolveCamera({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('camera-screen')).not.toBeInTheDocument()
  })

  it('shows a useful message when camera permission is denied', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByTestId('start-record'))
    expect(await screen.findByText(/摄像头权限被拒绝/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新尝试' })).toBeInTheDocument()
  })
})
