const MAX_EDGE = 1600

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('设备无法生成 WebP 图片。')),
      'image/webp',
      0.82,
    )
  })
}

export async function compressImageToWebP(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择 JPG、PNG、HEIC 或 WebP 图片。')
  if (file.size > 25 * 1024 * 1024) throw new Error('图片超过 25MB，请先缩小后再试。')

  let source: CanvasImageSource
  let sourceWidth: number
  let sourceHeight: number
  let release: () => void = () => {}
  try {
    const bitmap = await createImageBitmap(file)
    source = bitmap
    sourceWidth = bitmap.width
    sourceHeight = bitmap.height
    release = () => bitmap.close()
  } catch {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = objectUrl
      await image.decode()
      source = image
      sourceWidth = image.naturalWidth
      sourceHeight = image.naturalHeight
    } catch {
      throw new Error('图片解码失败，请换一张照片或转换为 JPG 后再试。')
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    release()
    throw new Error('当前浏览器无法处理图片画布。')
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  release()
  return readAsDataUrl(await canvasToBlob(canvas))
}
