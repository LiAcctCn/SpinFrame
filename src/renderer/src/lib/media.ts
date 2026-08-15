import type { MediaAsset } from '@shared/project'
import { mediaUrl } from '@shared/project'

export async function probeMedia(asset: MediaAsset): Promise<Partial<MediaAsset>> {
  const url = mediaUrl(asset)
  if (!url) return {}
  if (asset.kind === 'cover') {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  }
  const element = document.createElement(asset.kind === 'music' ? 'audio' : 'video')
  element.preload = 'metadata'
  element.src = url
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Media metadata timed out')), 12000)
    element.onloadedmetadata = () => { window.clearTimeout(timeout); resolve() }
    element.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Could not read ${asset.name}`)) }
  })
  const video = element instanceof HTMLVideoElement ? element : undefined
  return {
    duration: Number.isFinite(element.duration) ? element.duration : undefined,
    width: video?.videoWidth,
    height: video?.videoHeight
  }
}

export async function analyzeAudio(asset: MediaAsset, bins = 96): Promise<number[]> {
  const url = mediaUrl(asset)
  if (!url) return []
  const response = await fetch(url)
  const bytes = await response.arrayBuffer()
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(bytes)
    const channel = buffer.getChannelData(0)
    const samplesPerBin = Math.max(1, Math.floor(channel.length / bins))
    const peaks = Array.from({ length: bins }, (_, bin) => {
      const start = bin * samplesPerBin
      const end = Math.min(channel.length, start + samplesPerBin)
      let energy = 0
      const stride = Math.max(1, Math.floor((end - start) / 1000))
      let count = 0
      for (let sample = start; sample < end; sample += stride) {
        energy += channel[sample] * channel[sample]
        count += 1
      }
      return Math.sqrt(energy / Math.max(1, count))
    })
    const max = Math.max(...peaks, 0.001)
    return peaks.map((value) => Math.max(0.08, Math.min(1, value / max)))
  } finally {
    await context.close()
  }
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

export async function extractAccent(asset: MediaAsset): Promise<string> {
  const url = mediaUrl(asset)
  if (!url) return '#a94d3d'
  const image = new Image()
  image.src = url
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return '#a94d3d'
  context.drawImage(image, 0, 0, 32, 32)
  const pixels = context.getImageData(0, 0, 32, 32).data
  let total = 0
  let red = 0
  let green = 0
  let blue = 0
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
    const brightness = (r + g + b) / 3
    if (brightness < 24 || brightness > 238) continue
    const weight = 1 + saturation / 80
    red += r * weight
    green += g * weight
    blue += b * weight
    total += weight
  }
  if (!total) return '#a94d3d'
  const mean = [red / total, green / total, blue / total]
  const gray = mean.reduce((sum, value) => sum + value, 0) / 3
  const boosted = mean.map((value) => Math.max(28, Math.min(210, gray + (value - gray) * 1.45)))
  return rgbToHex(boosted[0], boosted[1], boosted[2])
}
