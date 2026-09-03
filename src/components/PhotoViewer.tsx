import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'

type Point = { x: number; y: number }

export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const pointers = useRef(new Map<number, Point>())
  const lastDistance = useRef<number | null>(null)
  const lastPoint = useRef<Point | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }) }
  const clampScale = (value: number) => Math.max(1, Math.min(4, value))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) lastPoint.current = { x: event.clientX, y: event.clientY }
  }

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.current.values()]
    if (points.length >= 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      if (lastDistance.current) setScale((current) => clampScale(current * distance / lastDistance.current!))
      lastDistance.current = distance
      return
    }
    if (scale > 1 && lastPoint.current) {
      const next = points[0]
      setOffset((current) => ({ x: current.x + next.x - lastPoint.current!.x, y: current.y + next.y - lastPoint.current!.y }))
      lastPoint.current = next
    }
  }

  const pointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    lastDistance.current = null
    lastPoint.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const zoom = (delta: number) => setScale((current) => {
    const next = clampScale(current + delta)
    if (next === 1) setOffset({ x: 0, y: 0 })
    return next
  })

  return (
    <div className="photo-viewer" data-testid="photo-viewer" role="dialog" aria-modal="true" aria-label={`${alt}大图`}>
      <div
        className="photo-viewer-stage"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onDoubleClick={() => scale === 1 ? setScale(2.5) : reset()}
      >
        <img src={src} alt={alt} draggable={false} style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }} />
      </div>
      <button className="viewer-close" onClick={onClose} aria-label="关闭大图"><X /></button>
      <div className="viewer-controls">
        <button onClick={() => zoom(-0.5)} disabled={scale <= 1} aria-label="缩小图片"><Minus /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => zoom(0.5)} disabled={scale >= 4} aria-label="放大图片"><Plus /></button>
        <button onClick={reset} aria-label="复位图片"><RotateCcw /></button>
      </div>
    </div>
  )
}
