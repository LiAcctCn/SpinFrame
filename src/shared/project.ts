export type AssetKind = 'transitionVideo' | 'cover' | 'rightVideo' | 'music' | 'lyrics'

export interface MediaAsset {
  id: string
  kind: AssetKind
  name: string
  relativePath: string
  mimeType: string
  duration?: number
  width?: number
  height?: number
}

export interface FocusPoint {
  x: number
  y: number
}

export interface LyricsLine {
  time: number
  text: string
}

export interface LyricsTrack {
  asset?: MediaAsset
  lines: LyricsLine[]
}

export interface VideoProject {
  version: 1
  id: string
  title: string
  artist: string
  templateId: 'editorial-vinyl'
  transitionVideo?: MediaAsset
  cover?: MediaAsset
  rightVideo?: MediaAsset
  music?: MediaAsset
  lyrics?: LyricsTrack
  musicAnalysis?: number[]
  palette: {
    accent: string
    ink: string
    paper: string
  }
  transition: {
    focusPoint: FocusPoint
    startTime: number
    duration: number
  }
  coverTransform: {
    scale: number
    x: number
    y: number
  }
  rightVideoTransform: {
    scale: number
    x: number
    y: number
  }
  player: {
    duration: number
    musicStartOffset: number
    vinylRotationSpeed: number
    heading: string
    eyebrow: string
  }
  export: {
    width: number
    height: number
    fps: number
    quality: 'high' | 'balanced' | 'compact'
  }
  updatedAt: string
}

export const DEFAULT_LYRICS: LyricsLine[] = [
  { time: 0, text: '享受一分钟的感动' },
  { time: 3.8, text: '是否爱上一个人不问明天过后' },
  { time: 8.2, text: '山明和水秀不比你有看头' },
  { time: 12.5, text: '牵着你的手一直走到最后' }
]

export function createDemoProject(): VideoProject {
  return {
    version: 1,
    id: crypto.randomUUID(),
    title: '明天过后',
    artist: '张杰',
    templateId: 'editorial-vinyl',
    palette: {
      accent: '#a94d3d',
      ink: '#171614',
      paper: '#e9e5dc'
    },
    transition: {
      focusPoint: { x: 0.5, y: 0.5 },
      startTime: 2.8,
      duration: 1.1
    },
    coverTransform: { scale: 1, x: 0, y: 0 },
    rightVideoTransform: { scale: 1, x: 0, y: 0 },
    player: {
      duration: 15,
      musicStartOffset: 0,
      vinylRotationSpeed: 10,
      heading: 'MEMORY',
      eyebrow: 'SELF PORTRAIT — 2026'
    },
    export: {
      width: 1920,
      height: 1080,
      fps: 30,
      quality: 'balanced'
    },
    updatedAt: new Date().toISOString()
  }
}

export function totalDuration(project: VideoProject): number {
  return Math.max(1, project.player.duration)
}

export function mediaUrl(asset?: MediaAsset): string | undefined {
  if (!asset) return undefined
  const url = `spinframe-media://asset/${asset.relativePath.split('/').map(encodeURIComponent).join('/')}`
  return isImageAsset(asset) ? `${url}?max=2560` : url
}

export function isImageAsset(asset?: MediaAsset): boolean {
  return asset?.mimeType.startsWith('image/') ?? false
}

export function parseLrc(source: string): LyricsLine[] {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\0/g, '').replace(/\r\n?/g, '\n')
  const offsetMatch = normalized.match(/\[offset:\s*([+-]?\d+)\s*\]/i)
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0
  const lines: LyricsLine[] = []
  const plainLines: string[] = []
  for (const rawLine of normalized.split('\n')) {
    const timestamps = [...rawLine.matchAll(/\[(?:(\d{1,2}):)?(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g)]
    const text = rawLine
      .replace(/\[[^\]]+\]/g, '')
      .replace(/<(?:(?:\d{1,2}:)?\d{1,3}:[0-5]?\d(?:[.:]\d{1,3})?)>/g, '')
      .trim()
    if (!text) continue
    if (!timestamps.length) {
      plainLines.push(text)
      continue
    }
    for (const stamp of timestamps) {
      const hours = Number(stamp[1] ?? 0)
      const minutes = Number(stamp[2])
      const seconds = Number(stamp[3])
      const fraction = stamp[4] ? Number(`0.${stamp[4].padEnd(3, '0').slice(0, 3)}`) : 0
      lines.push({ time: Math.max(0, hours * 3600 + minutes * 60 + seconds + fraction + offsetSeconds), text })
    }
  }
  if (lines.length) return lines.sort((a, b) => a.time - b.time)
  return plainLines.map((text, index) => ({ time: index * 4, text }))
}
