import type { FoodEntry } from '../types'

export interface RankingShareModel {
  title: string
  subtitle: string
  rows: Array<{ rank: number; name: string; note: string }>
}

export function buildRankingShareModel(entries: FoodEntry[], periodLabel: string, periodKey: string): RankingShareModel {
  const isBlacklist = periodLabel.includes('黑榜')
  return {
    title: `我的${periodLabel}`,
    subtitle: isBlacklist ? `${periodKey} · 只代表我的味觉和这一次体验` : `${periodKey} · 不是最好吃，是我最想留下`,
    rows: entries.slice(0, 10).map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      note: entry.note?.trim() || entry.tags.slice(0, 2).join(' · ') || entry.location,
    })),
  }
}

export async function createRankingShareFile(entries: FoodEntry[], periodLabel: string, periodKey: string): Promise<File> {
  const model = buildRankingShareModel(entries, periodLabel, periodKey)
  const isBlacklist = periodLabel.includes('黑榜')
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法生成排行榜图片。')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#e32323'
  context.fillRect(72, 68, 12, 96)
  context.fillStyle = '#111111'
  context.font = '700 68px system-ui, sans-serif'
  context.fillText(model.title, 118, 125)
  context.fillStyle = '#666666'
  context.font = '400 28px system-ui, sans-serif'
  context.fillText(model.subtitle, 118, 174)
  context.strokeStyle = '#111111'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(72, 224)
  context.lineTo(1008, 224)
  context.stroke()

  if (!model.rows.length) {
    context.fillStyle = '#777777'
    context.font = '500 38px system-ui, sans-serif'
    context.fillText('还没有完成复判的味道', 72, 330)
  }

  model.rows.forEach((row, index) => {
    const top = 268 + index * 102
    context.fillStyle = row.rank <= 3 ? '#e32323' : '#111111'
    context.font = '700 34px system-ui, sans-serif'
    context.fillText(String(row.rank).padStart(2, '0'), 76, top + 39)
    context.fillStyle = '#111111'
    context.font = '650 36px system-ui, sans-serif'
    context.fillText(row.name.slice(0, 18), 166, top + 34)
    context.fillStyle = '#777777'
    context.font = '400 23px system-ui, sans-serif'
    context.fillText(row.note.slice(0, 30), 166, top + 67)
    context.strokeStyle = '#e5e5e5'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(72, top + 88)
    context.lineTo(1008, top + 88)
    context.stroke()
  })

  context.fillStyle = '#111111'
  context.font = '700 28px system-ui, sans-serif'
  context.fillText('PERSONAL FOOD AUTHORITY', 72, 1350)
  context.fillStyle = '#e32323'
  context.fillRect(72, 1377, 188, 5)
  context.fillStyle = '#777777'
  context.font = '400 22px system-ui, sans-serif'
  context.fillText(isBlacklist ? '越靠前，越难吃。' : '越靠前，越好吃。', 282, 1385)

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('生成排行榜图片失败。')), 'image/png'))
  return new File([blob], `我的${periodLabel}-${periodKey}.png`, { type: 'image/png', lastModified: Date.now() })
}

export async function shareOrDownloadRanking(file: File): Promise<'shared' | 'downloaded'> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: file.name.replace(/\.png$/, ''), text: '这是我的个人味觉排行榜。' })
    return 'shared'
  }
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
