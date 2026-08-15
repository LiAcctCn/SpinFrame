import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Upload } from 'lucide-react'
import { mediaUrl, totalDuration, type FocusPoint, type VideoProject } from '@shared/project'
import { resolveCompositionTime } from '@shared/timeline'
import { CompositionStage } from '@/components/composition/CompositionStage'
import { InspectorPanel } from '@/components/editor/InspectorPanel'
import { MaterialPanel } from '@/components/editor/MaterialPanel'
import { SimpleTimeline } from '@/components/editor/SimpleTimeline'
import { markExportReady } from '@/lib/export-bridge'
import { useEditorStore } from '@/store/editor'

function usePlaybackClock(project?: VideoProject): void {
  const playing = useEditorStore((state) => state.playing)
  useEffect(() => {
    if (!playing || !project) return
    const state = useEditorStore.getState()
    const startTime = state.playhead
    const startedAt = performance.now()
    const end = totalDuration(project)
    let frame = 0
    const tick = (now: number): void => {
      const next = startTime + (now - startedAt) / 1000
      if (next >= end) {
        useEditorStore.getState().setPlayhead(end)
        useEditorStore.getState().setPlaying(false)
        return
      }
      useEditorStore.getState().setPlayhead(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, project?.id])
}

function TimelineAudio({ project, time, playing }: { project: VideoProject; time: number; playing: boolean }): JSX.Element | null {
  const ref = useRef<HTMLAudioElement>(null)
  const url = mediaUrl(project.music)
  const timeline = resolveCompositionTime(project, time)
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    const target = Math.max(0, timeline.musicTime)
    if (Math.abs(audio.currentTime - target) > (playing ? 0.2 : 0.02)) audio.currentTime = Math.min(target, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.01) : target)
    if (playing) void audio.play().catch(() => undefined)
    else audio.pause()
  }, [timeline.musicTime, playing])
  return url ? <audio ref={ref} src={url} preload="auto" /> : null
}

function ScaledPreview({ project }: { project: VideoProject }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const playhead = useEditorStore((state) => state.playhead)
  const playing = useEditorStore((state) => state.playing)
  const focusPicking = useEditorStore((state) => state.focusPicking)
  const update = useEditorStore((state) => state.updateProject)
  const setFocusPicking = useEditorStore((state) => state.setFocusPicking)
  const portrait = project.export.height > project.export.width
  const stageWidth = portrait ? 1080 : 1920
  const stageHeight = portrait ? 1920 : 1080

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const updateScale = (): void => {
      const bounds = host.getBoundingClientRect()
      setScale(Math.min((bounds.width - 68) / stageWidth, (bounds.height - 84) / stageHeight))
    }
    const observer = new ResizeObserver(updateScale)
    observer.observe(host)
    updateScale()
    return () => observer.disconnect()
  }, [stageWidth, stageHeight])

  const selectFocus = (point: FocusPoint): void => {
    update((next) => { next.transition.focusPoint = point; return next })
    setFocusPicking(false)
  }

  return (
    <main className="preview-area" ref={hostRef}>
      <div className="preview-topline"><span>成片预览</span><span>{portrait ? '竖屏' : '横屏'}</span></div>
      <div className="preview-canvas" style={{ width: stageWidth * scale, height: stageHeight * scale }}>
        <div style={{ width: stageWidth, height: stageHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <CompositionStage project={project} time={playhead} playing={playing} focusPicking={focusPicking} onFocusSelect={selectFocus} />
        </div>
      </div>
    </main>
  )
}

function EditorApp({ project }: { project: VideoProject }): JSX.Element {
  const playhead = useEditorStore((state) => state.playhead)
  const playing = useEditorStore((state) => state.playing)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const openProject = useEditorStore((state) => state.openProject)
  const setInspector = useEditorStore((state) => state.setInspector)
  const inspector = useEditorStore((state) => state.inspector)
  const error = useEditorStore((state) => state.error)
  const setError = useEditorStore((state) => state.setError)
  usePlaybackClock(project)

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (event.code === 'Space' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) {
        event.preventDefault()
        setPlaying(!useEditorStore.getState().playing)
      }
      if (event.code === 'Home' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        setPlaying(false)
        setPlayhead(0)
      }
      if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault()
        setPlaying(false)
        setPlayhead(useEditorStore.getState().playhead + (event.code === 'ArrowRight' ? 0.25 : -0.25))
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyE') {
        event.preventDefault()
        setPlaying(false)
        setInspector('export')
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [setPlaying, setPlayhead, setInspector])

  return (
    <div className="editor-shell">
      <header className="app-header">
        <div className="brand"><div className="brand-mark"><span /></div><b>SPINFRAME</b></div>
        <div className="project-title"><b>{project.title || '未命名项目'}</b><span>自动保存</span></div>
        <div className="header-actions">
          <button onClick={() => void openProject()}><FolderOpen size={15} /> 打开项目</button>
          <button className={`header-export${inspector === 'export' ? ' active' : ''}`} onClick={() => { setPlaying(false); setInspector('export') }}><Upload size={15} /> 导出视频</button>
        </div>
      </header>
      <div className="workspace">
        <MaterialPanel project={project} />
        <ScaledPreview project={project} />
        <InspectorPanel project={project} />
      </div>
      <SimpleTimeline project={project} />
      <TimelineAudio project={project} time={playhead} playing={playing} />
      {error && <div className="error-toast"><b>操作未完成</b><span>{error}</span><button onClick={() => setError(undefined)}>关闭</button></div>}
    </div>
  )
}

function ExportRenderer({ project }: { project: VideoProject }): JSX.Element {
  const time = useEditorStore((state) => state.playhead)
  useEffect(() => { markExportReady() }, [])
  return <CompositionStage project={project} time={time} playing={time >= project.transition.startTime + project.transition.duration - 0.35} exportMode />
}

export default function App(): JSX.Element {
  const project = useEditorStore((state) => state.project)
  const loading = useEditorStore((state) => state.loading)
  const loadProject = useEditorStore((state) => state.loadProject)
  const exportMode = new URLSearchParams(window.location.search).get('export') === '1'
  useEffect(() => { void loadProject() }, [loadProject])
  if (loading || !project) return <div className="boot-screen"><div className="brand-mark"><span /></div><b>SPINFRAME</b><small>PREPARING COMPOSITION</small></div>
  return exportMode ? <ExportRenderer project={project} /> : <EditorApp project={project} />
}
