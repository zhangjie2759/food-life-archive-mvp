import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Crop, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { calculateSquareCropRegion, cropOffsetLimits, validateImageFile } from '../lib/image'

interface Point {
  x: number
  y: number
}

function canvasToWebP(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('设备无法生成裁剪图片。')),
      'image/webp',
      0.9,
    )
  })
}

export function ImageCropper({ file, onConfirm, onCancel, purpose = 'recognize' }: {
  file: File
  onConfirm: (file: File) => Promise<void>
  onCancel: () => void
  purpose?: 'recognize' | 'replace'
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ pointerId: number; origin: Point; offset: Point } | null>(null)
  const [viewportSize, setViewportSize] = useState(0)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const update = () => setViewportSize(stage.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const limits = naturalSize.width && viewportSize
    ? cropOffsetLimits(naturalSize.width, naturalSize.height, viewportSize, zoom)
    : { x: 0, y: 0 }
  const clamp = (point: Point) => ({
    x: Math.max(-limits.x, Math.min(limits.x, point.x)),
    y: Math.max(-limits.y, Math.min(limits.y, point.y)),
  })

  useEffect(() => {
    setOffset((current) => {
      const next = clamp(current)
      return next.x === current.x && next.y === current.y ? current : next
    })
  // Re-clamp when the image, viewport or zoom changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limits.x, limits.y])

  const displayScale = naturalSize.width && viewportSize
    ? Math.max(viewportSize / naturalSize.width, viewportSize / naturalSize.height) * zoom
    : 1

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || !naturalSize.width) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, origin: { x: event.clientX, y: event.clientY }, offset }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clamp({
      x: drag.offset.x + event.clientX - drag.origin.x,
      y: drag.offset.y + event.clientY - drag.origin.y,
    }))
  }

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const confirm = async () => {
    const image = imageRef.current
    if (!image || !naturalSize.width || !viewportSize || busy) return
    setBusy(true)
    setError('')
    try {
      const region = calculateSquareCropRegion({
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        viewportSize,
        zoom,
        offsetX: offset.x,
        offsetY: offset.y,
      })
      const outputSize = Math.max(1, Math.min(1600, Math.round(region.sourceSize)))
      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器无法处理裁剪画布。')
      context.drawImage(
        image,
        region.sourceX,
        region.sourceY,
        region.sourceSize,
        region.sourceSize,
        0,
        0,
        outputSize,
        outputSize,
      )
      const blob = await canvasToWebP(canvas)
      await onConfirm(new File([blob], file.name.replace(/\.[^.]+$/, '') + '-cropped.webp', { type: 'image/webp', lastModified: Date.now() }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '裁剪失败，请重新尝试。')
      setBusy(false)
    }
  }

  useEffect(() => {
    try {
      validateImageFile(file)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取这张图片。')
    }
  }, [file])

  return (
    <section className="crop-screen" data-testid="image-cropper">
      <div className="crop-topbar">
        <button className="camera-icon-button" onClick={onCancel} aria-label="取消裁剪"><X /></button>
        <div><strong>框准要识别的这一道</strong><span>{purpose === 'replace' ? '移动并缩放，确认新的档案照片' : '移动并缩放，只把框内食物交给 AI'}</span></div>
        <button className="camera-icon-button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }} disabled={busy} aria-label="重置裁剪"><RotateCcw /></button>
      </div>

      <div className="crop-workspace">
        <div
          ref={stageRef}
          className="crop-stage"
          data-testid="crop-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <img
            ref={imageRef}
            src={objectUrl}
            alt="待裁剪的食物"
            draggable={false}
            onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setError('图片解码失败，请换一张照片或转换为 JPG 后再试。')}
            style={{
              width: naturalSize.width ? naturalSize.width * displayScale : undefined,
              height: naturalSize.height ? naturalSize.height * displayScale : undefined,
              transform: `translate3d(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px), 0)`,
            }}
          />
          <div className="crop-grid" aria-hidden="true"><span /><span /><span /><span /></div>
          {!naturalSize.width && !error && <div className="crop-loading"><LoaderCircle className="spin" />正在读取照片…</div>}
        </div>
      </div>

      <div className="crop-controls">
        {error && <p className="crop-error" role="alert">{error}</p>}
        <label className="crop-zoom"><span>缩放</span><input data-testid="crop-zoom" type="range" min="1" max="3" step="0.01" value={zoom} disabled={busy || Boolean(error)} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <button className="crop-confirm" data-testid="crop-confirm" disabled={busy || Boolean(error) || !naturalSize.width} onClick={() => void confirm()}>
          {busy ? <LoaderCircle className="spin" /> : <><Crop /><span>{purpose === 'replace' ? '裁剪并替换' : '裁剪并识别'}</span><Check /></>}
        </button>
        <button className="crop-cancel" disabled={busy} onClick={onCancel}>重拍或换一张</button>
      </div>
    </section>
  )
}
