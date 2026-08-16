import { useEffect, useMemo, useRef } from 'react'
import { Heart, ListMusic, MessageCircle, Pause, Play, Repeat2, SkipBack, SkipForward } from 'lucide-react'
import type { FocusPoint, LyricsLine, MediaAsset, VideoProject } from '@shared/project'
import { isImageAsset, LYRICS_PLACEHOLDER, mediaUrl, totalDuration } from '@shared/project'
import { easeOutCubic, formatTime, mix, resolveCompositionTime, smoothstep } from '@shared/timeline'
import './composition.css'

interface CompositionStageProps {
  project: VideoProject
  time: number
  playing: boolean
  exportMode?: boolean
  focusPicking?: boolean
  onFocusSelect?: (point: FocusPoint) => void
}

interface TimelineMediaProps {
  asset?: MediaAsset
  sourceTime: number
  active: boolean
  playing: boolean
  exportMode: boolean
  className: string
  style?: React.CSSProperties
}

function TimelineMedia({ asset, sourceTime, active, playing, exportMode, className, style }: TimelineMediaProps): JSX.Element | null {
  const ref = useRef<HTMLVideoElement>(null)
  const url = mediaUrl(asset)
  const image = isImageAsset(asset)
  useEffect(() => {
    const video = ref.current
    if (!video || image) return
    const silenceVideo = (): void => {
      video.defaultMuted = true
      video.muted = true
      video.volume = 0
    }
    silenceVideo()
    video.addEventListener('volumechange', silenceVideo)
    if (exportMode) {
      video.pause()
      return () => video.removeEventListener('volumechange', silenceVideo)
    }
    const duration = Number.isFinite(video.duration) ? video.duration : sourceTime + 1
    const target = Math.max(0, Math.min(sourceTime, Math.max(0, duration - 0.01)))
    if (Math.abs(video.currentTime - target) > 0.16) video.currentTime = target
    const frozenAtEnd = Number.isFinite(video.duration) && sourceTime >= Math.max(0, video.duration - 0.02)
    if (playing && active && !frozenAtEnd) void video.play().catch(() => undefined)
    else video.pause()
    return () => video.removeEventListener('volumechange', silenceVideo)
  }, [sourceTime, active, playing, exportMode, image, asset?.id])
  if (!url) return null
  if (image) return <img className={className} src={url} alt="" draggable={false} decoding="sync" loading="eager" style={style} />
  return (
    <video
      ref={ref}
      className={className}
      src={url}
      muted
      disableRemotePlayback
      disablePictureInPicture
      playsInline
      preload="auto"
      data-timeline-time={sourceTime.toFixed(5)}
      style={style}
    />
  )
}

function AlbumLabel({ project }: { project: VideoProject }): JSX.Element {
  const coverUrl = mediaUrl(project.cover)
  return (
    <div className="album-label">
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          style={{
            transform: `translate(${project.coverTransform.x * 32}px, ${project.coverTransform.y * 32}px) scale(${project.coverTransform.scale})`
          }}
        />
      ) : (
        <div className="album-placeholder">
          <span>{project.title.slice(0, 4)}</span>
          <small>{project.artist}</small>
        </div>
      )}
      <span className="spindle" />
    </div>
  )
}

function Vinyl({ project, angle }: { project: VideoProject; angle: number }): JSX.Element {
  return (
    <div className="vinyl-assembly" style={{ transform: `rotate(${angle}deg)` }}>
      <div className="vinyl-surface">
        <div className="vinyl-reflection" />
        <AlbumLabel project={project} />
      </div>
    </div>
  )
}

function Lyrics({ lines, musicTime }: { lines: LyricsLine[]; musicTime: number }): JSX.Element {
  let activeIndex = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].time <= musicTime) { activeIndex = index; break }
  }
  const current = Math.max(0, activeIndex)
  const visible = lines.length <= 4
    ? lines.map((line, index) => ({ line, index }))
    : Array.from({ length: 4 }, (_, offset) => {
        const index = Math.max(0, Math.min(lines.length - 1, current - 1 + offset))
        return { line: lines[index], index }
      }).filter((item, index, all) => all.findIndex((candidate) => candidate.index === item.index) === index)
  return (
    <div className="editorial-lyrics">
      <span className="lyrics-label">LYRICS / 歌词</span>
      {visible.map(({ line, index }) => (
        <div key={`${index}-${line.time}`} className={index === current ? 'lyric-line current' : 'lyric-line'}>
          {line.text}
        </div>
      ))}
    </div>
  )
}

function Waveform({ project, time }: { project: VideoProject; time: number }): JSX.Element {
  const peaks = project.musicAnalysis?.length ? project.musicAnalysis : Array.from({ length: 52 }, (_, index) =>
    0.18 + 0.52 * Math.abs(Math.sin(index * 1.71) * Math.cos(index * 0.43))
  )
  const sample = Array.from({ length: 52 }, (_, index) => peaks[index % peaks.length])
  return (
    <div className="waveform" aria-hidden="true">
      {sample.map((peak, index) => {
        const pulse = 0.82 + 0.18 * Math.sin(time * 4.2 + index * 0.58)
        return <span key={index} style={{ height: `${Math.max(2, peak * pulse * 34)}px` }} />
      })}
    </div>
  )
}

function PlayerControls({ project, time, duration, playing }: { project: VideoProject; time: number; duration: number; playing: boolean }): JSX.Element {
  const progress = Math.min(1, time / Math.max(0.01, duration))
  return (
    <div className="player-chrome">
      <Waveform project={project} time={time} />
      <div className="progress-row">
        <span>{formatTime(time)}</span>
        <div className="progress-track">
          <i style={{ width: `${progress * 100}%` }} />
          <b style={{ left: `${progress * 100}%` }} />
        </div>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="control-row">
        <Repeat2 size={20} strokeWidth={1.35} />
        <SkipBack size={23} strokeWidth={1.45} fill="currentColor" />
        {playing ? <Pause size={30} strokeWidth={1.35} fill="currentColor" /> : <Play size={30} strokeWidth={1.35} fill="currentColor" />}
        <SkipForward size={23} strokeWidth={1.45} fill="currentColor" />
        <ListMusic size={20} strokeWidth={1.35} />
      </div>
    </div>
  )
}

function TransitionPlaceholder({ focus }: { focus: FocusPoint }): JSX.Element {
  return (
    <div className="transition-placeholder">
      <div className="placeholder-copy">
        <small>TRANSITION MATERIAL / 01</small>
        <strong>YOUR DISC<br />ENTERS HERE</strong>
      </div>
      <div className="placeholder-disc" style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}>
        <span />
      </div>
    </div>
  )
}

export function CompositionStage({ project, time, playing, exportMode = false, focusPicking = false, onFocusSelect }: CompositionStageProps): JSX.Element {
  const portrait = project.export.height > project.export.width
  const stageWidth = portrait ? 1080 : 1920
  const stageHeight = portrait ? 1920 : 1080
  const timeline = resolveCompositionTime(project, time)
  const focus = project.transition.focusPoint
  const p = timeline.transitionProgress
  const focusMove = smoothstep(0.06, 0.72, p)
  const clipScale = mix(1, 4.6, easeOutCubic(smoothstep(0, 0.84, p)))
  const clipOpacity = 1 - smoothstep(0.68, 0.91, p)
  const clipTranslateX = (0.5 - focus.x) * stageWidth * focusMove
  const clipTranslateY = (0.5 - focus.y) * stageHeight * focusMove
  const clipBlur = mix(0, 9, smoothstep(0.34, 0.77, p))

  const takeover = smoothstep(0.56, 0.9, p)
  const cameraSettle = easeOutCubic(smoothstep(0.63, 1, p))
  const playerScale = time < timeline.playerStart ? mix(3.25, 1, cameraSettle) : 1
  const playerTranslateX = time < timeline.playerStart ? mix(portrait ? -34 : 270, 0, cameraSettle) : 0
  const playerTranslateY = time < timeline.playerStart ? mix(portrait ? 95 : -64, 0, cameraSettle) : 0
  const playerOpacity = time < project.transition.startTime ? 0 : takeover
  const detailTime = Math.max(timeline.playerTime, smoothstep(0.86, 1, p) * 0.65)
  const rightOpacity = smoothstep(0.04, 0.62, detailTime)
  const headingOpacity = smoothstep(0.12, 0.72, detailTime)
  const lyricsOpacity = smoothstep(0.22, 0.8, detailTime)
  const chromeOpacity = smoothstep(0.32, 0.92, detailTime)
  const angle = (timeline.musicTime / Math.max(1, project.player.vinylRotationSpeed)) * 360
  const transitionVideoTime = project.transitionVideo?.duration
    ? Math.min(time, Math.max(0, project.transitionVideo.duration - 0.01))
    : time
  const rightVideoTime = project.rightVideo?.duration
    ? timeline.playerTime % Math.max(0.01, project.rightVideo.duration)
    : timeline.playerTime
  const lyrics = project.lyrics?.lines.length ? project.lyrics.lines : LYRICS_PLACEHOLDER
  const duration = totalDuration(project)
  const showTransitionLayer = time < timeline.playerStart
  const showPlayerScene = time >= project.transition.startTime

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!focusPicking || !onFocusSelect) return
    const bounds = event.currentTarget.getBoundingClientRect()
    onFocusSelect({
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    })
  }

  const paperStyle = useMemo(() => ({
    '--paper': project.palette.paper,
    '--ink': project.palette.ink,
    '--accent': project.palette.accent
  }) as React.CSSProperties, [project.palette])

  return (
    <div className={`composition-stage${portrait ? ' is-portrait' : ''}${focusPicking ? ' is-focus-picking' : ''}${exportMode ? ' is-export' : ''}`} style={paperStyle} onClick={handleClick}>
      {showTransitionLayer && <div
        className="transition-layer"
        style={{
          opacity: time >= timeline.playerStart ? 0 : clipOpacity,
          transformOrigin: `${focus.x * 100}% ${focus.y * 100}%`,
          transform: `translate(${clipTranslateX}px, ${clipTranslateY}px) scale(${clipScale})`,
          filter: `blur(${clipBlur}px)`
        }}
      >
        {project.transitionVideo ? (
          <TimelineMedia
            asset={project.transitionVideo}
            sourceTime={transitionVideoTime}
            active={time < timeline.playerStart}
            playing={playing}
            exportMode={exportMode}
            className="transition-video"
          />
        ) : <TransitionPlaceholder focus={focus} />}
      </div>}

      {showPlayerScene && <div
        className="player-scene"
        style={{
          opacity: playerOpacity,
          transformOrigin: portrait ? '62.8% 37.5%' : '35.4% 55%',
          transform: `translate(${playerTranslateX}px, ${playerTranslateY}px) scale(${playerScale})`
        }}
      >
        <div className="paper-field" />
        <div className="right-visual" style={{ opacity: rightOpacity }}>
          {project.rightVideo ? (
            <TimelineMedia
              asset={project.rightVideo}
              sourceTime={rightVideoTime}
              active={time >= project.transition.startTime}
              playing={playing}
              exportMode={exportMode}
              className="right-video"
              style={{
                transform: `translate(${project.rightVideoTransform.x * 80}px, ${project.rightVideoTransform.y * 80}px) scale(${project.rightVideoTransform.scale})`
              }}
            />
          ) : (
            <div className="right-placeholder">
              <div className="portrait-shape" />
              <span>RIGHT SIDE<br />VISUAL</span>
              <small>02 / VISUAL MATERIAL</small>
            </div>
          )}
        </div>
        <div className="image-feather" />
        <div className="soft-bloom" />

        <div className="masthead" style={{ opacity: headingOpacity }}>
          <div className="masthead-topline"><span>SPINFRAME ARCHIVE</span><span>VOL. 01</span></div>
          <h1>{project.player.heading}</h1>
          <p>{project.player.eyebrow}</p>
        </div>

        <div className="lyrics-wrap" style={{ opacity: lyricsOpacity }}>
          <Lyrics lines={lyrics} musicTime={timeline.musicTime} />
        </div>

        <div className="vinyl-position">
          <Vinyl project={project} angle={angle} />
        </div>

        <div className="chrome-wrap" style={{ opacity: chromeOpacity }}>
          <PlayerControls project={project} time={timeline.musicTime} duration={duration} playing={playing} />
        </div>

        <div className="social-marks" style={{ opacity: chromeOpacity }}>
          <span><Heart size={20} fill="var(--accent)" strokeWidth={1.2} /> 48</span>
          <span><MessageCircle size={19} strokeWidth={1.2} /> 12</span>
        </div>
        <div className="vertical-note">A TEMPLATE-BASED MUSIC MOTION STUDY</div>
        <div className="scene-grain" />
      </div>}

      {focusPicking && (
        <div className="focus-overlay">
          <div className="focus-crosshair" style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}>
            <span /><span />
          </div>
          <div className="focus-instruction">CLICK THE DISC CENTER</div>
        </div>
      )}
    </div>
  )
}
