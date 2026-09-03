import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { Mascot } from './Mascot'

type CameraStatus = 'starting' | 'ready' | 'capturing' | 'error'

function cameraErrorMessage(reason: unknown) {
  if (reason instanceof DOMException && reason.name === 'NotAllowedError') return '摄像头权限被拒绝。请在浏览器设置中允许访问后重试。'
  if (reason instanceof DOMException && reason.name === 'NotFoundError') return '没有找到可用摄像头。你可以返回后使用相册备用入口。'
  return '暂时无法打开摄像头。请检查浏览器权限，或返回使用相册备用入口。'
}

export function CameraCapture({ onCapture, onClose }: { onCapture: (file: File) => Promise<void>; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestGeneration = useRef(0)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [error, setError] = useState('')

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    const generation = ++requestGeneration.current
    stopCamera()
    setStatus('starting')
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia unavailable')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (generation !== requestGeneration.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        return
      }
      video.srcObject = stream
      await video.play()
      setStatus('ready')
    } catch (reason) {
      if (generation !== requestGeneration.current) return
      stopCamera()
      setError(cameraErrorMessage(reason))
      setStatus('error')
    }
  }, [stopCamera])

  useEffect(() => {
    void startCamera(facingMode)
    return () => {
      requestGeneration.current += 1
      stopCamera()
    }
  }, [facingMode, startCamera, stopCamera])

  const takePhoto = async () => {
    const video = videoRef.current
    if (!video || status !== 'ready') return
    setStatus('capturing')
    setError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 960
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas unavailable')
      if (facingMode === 'user') {
        context.translate(canvas.width, 0)
        context.scale(-1, 1)
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('capture failed')), 'image/jpeg', 0.92))
      stopCamera()
      await onCapture(new File([blob], `food-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
    } catch {
      setError('拍照失败，请重新打开摄像头再试。')
      setStatus('error')
    }
  }

  const close = () => {
    requestGeneration.current += 1
    stopCamera()
    onClose()
  }

  const importPhoto = async (file?: File) => {
    if (!file) return
    requestGeneration.current += 1
    stopCamera()
    setStatus('capturing')
    await onCapture(file)
  }

  return (
    <section className="camera-screen" data-testid="camera-screen">
      <div className="camera-topbar">
        <button className="camera-icon-button" onClick={close} aria-label="关闭摄像头"><X /></button>
        <div><strong>拍下这道菜</strong><span>只记录，吃完再排</span></div>
        <button className="camera-icon-button" data-testid="camera-switch" onClick={() => setFacingMode((current) => current === 'environment' ? 'user' : 'environment')} disabled={status === 'starting' || status === 'capturing'} aria-label="切换前后摄像头"><RefreshCw /></button>
      </div>
      <div className="camera-viewfinder">
        <video ref={videoRef} data-testid="camera-viewfinder" autoPlay muted playsInline aria-label="实时摄像头取景" />
        {status === 'starting' && <div className="camera-state"><LoaderCircle className="spin" /><span>正在打开摄像头…</span></div>}
        {status === 'error' && <div className="camera-state error"><Camera /><strong>摄像头没有打开</strong><span>{error}</span><button className="button secondary" onClick={() => void startCamera(facingMode)}>重新尝试</button><button className="text-button" onClick={close}>进入榜单</button></div>}
        <div className="camera-guide" aria-hidden="true" />
        <Mascot pose="camera" className="camera-mascot" />
      </div>
      <div className="camera-controls">
        <span>把这一道菜放进画面中央</span>
        <button className="shutter" data-testid="camera-shutter" onClick={() => void takePhoto()} disabled={status !== 'ready'} aria-label="拍照">
          {status === 'capturing' ? <LoaderCircle className="spin" /> : <span />}
        </button>
        <button className="camera-import" onClick={() => importRef.current?.click()}>从相册上传历史照片</button>
        <input ref={importRef} data-testid="camera-import-input" className="visually-hidden" type="file" accept="image/*" onChange={(event) => void importPhoto(event.currentTarget.files?.[0])} />
      </div>
    </section>
  )
}
