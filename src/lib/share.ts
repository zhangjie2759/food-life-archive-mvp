import type { FoodEntry } from '../types'

export interface RankingShareModel {
  title: string
  subtitle: string
  rows: Array<{ rank: number; name: string; note: string; image: string }>
}

export function buildRankingShareModel(entries: FoodEntry[], periodLabel: string, periodKey: string): RankingShareModel {
  const isBlacklist = periodLabel.includes('黑榜')
  return {
    title: `我的${periodLabel}`,
    subtitle: isBlacklist ? `${periodKey} · 仅代表个人口味与单次体验` : `${periodKey} · 我的私人美食评审结果`,
    rows: entries.slice(0, 10).map((entry, index) => ({
      rank: index + 1,
      name: entry.bestowedName || entry.name,
      note: entry.note?.trim() || entry.tags.slice(0, 2).join(' · ') || entry.location,
      image: entry.image,
    })),
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, size: number) {
  context.save()
  context.beginPath()
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  context.clip()
  if (!image) {
    context.fillStyle = '#efefef'
    context.fillRect(x, y, size, size)
    context.fillStyle = '#bbbbbb'
    context.font = `700 ${Math.round(size / 3)}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.fillText('—', x + size / 2, y + size * 0.64)
  } else {
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    context.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height)
  }
  context.restore()
  context.textAlign = 'left'
  context.strokeStyle = '#111111'
  context.lineWidth = 3
  context.beginPath()
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  context.stroke()
}

export async function createRankingShareFile(entries: FoodEntry[], periodLabel: string, periodKey: string): Promise<File> {
  const model = buildRankingShareModel(entries, periodLabel, periodKey)
  const isBlacklist = periodLabel.includes('黑榜')
  const images = await Promise.all(model.rows.map((row) => loadImage(row.image)))
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法生成排行榜图片。')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#e32323'
  context.fillRect(64, 60, 10, 88)
  context.fillStyle = '#111111'
  context.textAlign = 'left'
  context.font = '800 64px system-ui, sans-serif'
  context.fillText(model.title, 108, 112)
  context.fillStyle = '#676767'
  context.font = '400 25px system-ui, sans-serif'
  context.fillText(model.subtitle, 108, 154)
  context.strokeStyle = '#111111'
  context.lineWidth = 2
  context.beginPath(); context.moveTo(64, 204); context.lineTo(1016, 204); context.stroke()

  model.rows.slice(0, 3).forEach((row, index) => {
    const x = 64 + index * 322
    drawCover(context, images[index], x + 50, 250, 220)
    context.fillStyle = row.rank === 1 && !isBlacklist ? '#e32323' : '#111111'
    context.font = '900 50px system-ui, sans-serif'
    context.fillText(String(row.rank).padStart(2, '0'), x, 515)
    context.fillStyle = '#111111'
    context.font = '750 29px system-ui, sans-serif'
    context.fillText(row.name.slice(0, 10), x, 562)
    context.fillStyle = '#777777'
    context.font = '400 20px system-ui, sans-serif'
    context.fillText(row.note.slice(0, 16), x, 594)
  })

  model.rows.slice(3).forEach((row, localIndex) => {
    const index = localIndex + 3
    const top = 650 + localIndex * 88
    drawCover(context, images[index], 114, top, 62)
    context.fillStyle = '#111111'
    context.font = '800 30px system-ui, sans-serif'
    context.fillText(String(row.rank).padStart(2, '0'), 64, top + 42)
    context.font = '700 29px system-ui, sans-serif'
    context.fillText(row.name.slice(0, 18), 205, top + 31)
    context.fillStyle = '#777777'
    context.font = '400 20px system-ui, sans-serif'
    context.fillText(row.note.slice(0, 32), 205, top + 59)
    context.strokeStyle = '#e4e4e4'
    context.lineWidth = 1
    context.beginPath(); context.moveTo(64, top + 77); context.lineTo(1016, top + 77); context.stroke()
  })

  if (!model.rows.length) {
    context.fillStyle = '#777777'
    context.font = '500 38px system-ui, sans-serif'
    context.fillText('还没有完成复判的味道', 64, 330)
  }

  context.fillStyle = '#111111'
  context.font = '800 27px system-ui, sans-serif'
  context.fillText('私人美食评审局', 64, 1360)
  context.fillStyle = '#e32323'
  context.fillRect(64, 1388, 174, 5)
  context.fillStyle = '#777777'
  context.font = '400 21px system-ui, sans-serif'
  context.fillText(isBlacklist ? '越靠前，越不想再吃。' : '越靠前，越值得留下。', 264, 1395)

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
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
