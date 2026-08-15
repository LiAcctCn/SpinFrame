import { flushSync } from 'react-dom'
import { useEditorStore } from '@/store/editor'

let resolveReady!: () => void
const ready = new Promise<void>((resolve) => { resolveReady = resolve })

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function seekVideo(video: HTMLVideoElement): Promise<void> {
  const raw = Number(video.dataset.timelineTime)
  if (!Number.isFinite(raw)) return
  video.defaultMuted = true
  video.muted = true
  video.volume = 0
  video.pause()
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => done(new Error('Timed out while loading video metadata')), 10000)
      const done = (error?: Error): void => {
        window.clearTimeout(timeout)
        video.removeEventListener('loadedmetadata', loaded)
        video.removeEventListener('error', failed)
        if (error) reject(error)
        else resolve()
      }
      const loaded = (): void => done()
      const failed = (): void => done(new Error('A video asset could not be decoded'))
      video.addEventListener('loadedmetadata', loaded)
      video.addEventListener('error', failed)
    })
  }
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('A video asset has an invalid duration')
  const duration = Number.isFinite(video.duration) ? video.duration : raw + 1
  const target = Math.max(0, Math.min(raw, Math.max(0, duration - 0.001)))
  if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => done(new Error(`Timed out while seeking video to ${target.toFixed(3)}s`)), 10000)
    const done = (error?: Error): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      video.removeEventListener('seeked', sought)
      video.removeEventListener('error', failed)
      if (error) reject(error)
      else resolve()
    }
    const sought = (): void => done()
    const failed = (): void => done(new Error(`A video frame could not be decoded at ${target.toFixed(3)}s`))
    video.addEventListener('seeked', sought, { once: true })
    video.addEventListener('error', failed, { once: true })
    video.currentTime = target
  })
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('An image asset could not be decoded')
}

window.spinframeExport = {
  ready,
  prepareFrame: async (time: number) => {
    flushSync(() => useEditorStore.getState().setPlayhead(time))
    await animationFrame()
    const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-timeline-time]')]
    await Promise.all(videos.map(seekVideo))
    await Promise.all([...document.images].map(decodeImage))
    await animationFrame()
    await animationFrame()
  }
}

export function markExportReady(): void {
  void document.fonts.ready.then(() => resolveReady())
}
