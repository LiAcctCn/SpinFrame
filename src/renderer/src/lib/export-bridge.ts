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
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve) => {
      const done = (): void => { video.removeEventListener('loadedmetadata', done); resolve() }
      video.addEventListener('loadedmetadata', done)
      window.setTimeout(done, 5000)
    })
  }
  const duration = Number.isFinite(video.duration) ? video.duration : raw + 1
  const target = Math.max(0, Math.min(raw, Math.max(0, duration - 0.001)))
  video.pause()
  if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return
  await new Promise<void>((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      video.removeEventListener('seeked', done)
      resolve()
    }
    video.addEventListener('seeked', done)
    video.currentTime = target
    window.setTimeout(done, 5000)
  })
}

window.spinframeExport = {
  ready,
  prepareFrame: async (time: number) => {
    flushSync(() => useEditorStore.getState().setPlayhead(time))
    await animationFrame()
    const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-timeline-time]')]
    await Promise.all(videos.map(seekVideo))
    await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : image.decode().catch(() => undefined)))
    await animationFrame()
    await animationFrame()
  }
}

export function markExportReady(): void {
  void document.fonts.ready.then(() => resolveReady())
}
