import type { VideoProject } from './project'

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))

export const mix = (from: number, to: number, amount: number): number => from + (to - from) * amount

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0))
  return x * x * (3 - 2 * x)
}

export function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - clamp(value), 3)
}

export interface CompositionTime {
  global: number
  transitionProgress: number
  playerStart: number
  playerTime: number
  musicTime: number
  isTransitioning: boolean
}

export function resolveCompositionTime(project: VideoProject, time: number): CompositionTime {
  const start = project.transition.startTime
  const end = start + project.transition.duration
  return {
    global: time,
    transitionProgress: clamp((time - start) / project.transition.duration),
    playerStart: end,
    playerTime: Math.max(0, time - end),
    musicTime: Math.max(0, time + project.player.musicStartOffset),
    isTransitioning: time >= start && time < end
  }
}

export function formatTime(seconds: number, showFrames = false, fps = 30): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const wholeSeconds = Math.floor(safe % 60)
  if (!showFrames) return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`
  const frames = Math.floor((safe % 1) * fps)
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}
