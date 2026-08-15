import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Crosshair, FolderOpen, Monitor, Play, Smartphone, X } from 'lucide-react'
import type { VideoProject } from '@shared/project'
import { formatTime } from '@shared/timeline'
import { useEditorStore } from '@/store/editor'

function PanelHeading({ title, note }: { title: string; note: string }): JSX.Element {
  return <div className="inspector-title"><h2>{title}</h2><p>{note}</p></div>
}

function ExportSettings({ project }: { project: VideoProject }): JSX.Element {
  const update = useEditorStore((state) => state.updateProject)
  const setInspector = useEditorStore((state) => state.setInspector)
  const setError = useEditorStore((state) => state.setError)
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [outputPath, setOutputPath] = useState<string>()
  const [startedAt, setStartedAt] = useState(0)
  const portrait = project.export.height > project.export.width

  useEffect(() => window.spinframe.onExportProgress((value) => setProgress(value.progress)), [])

  const setOrientation = (nextPortrait: boolean): void => update((next) => {
    next.export.width = nextPortrait ? 1080 : 1920
    next.export.height = nextPortrait ? 1920 : 1080
    next.export.fps = 30
    next.export.quality = 'balanced'
    return next
  })
  const estimate = progress > 0.015 ? Math.max(0, (Date.now() - startedAt) / progress * (1 - progress)) : 0
  const start = async (): Promise<void> => {
    const path = await window.spinframe.chooseExportPath(project.title || 'spinframe')
    if (!path) return
    setStatus('rendering')
    setProgress(0)
    setStartedAt(Date.now())
    setError(undefined)
    try {
      const exportSettings = { ...project.export, fps: 30, quality: 'balanced' as const }
      await window.spinframe.saveProject({ ...project, export: exportSettings })
      const result = await window.spinframe.startExport({ outputPath: path, ...exportSettings })
      setOutputPath(result.outputPath)
      setProgress(1)
      setStatus('done')
    } catch (error) {
      setStatus('idle')
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <button className="panel-back" onClick={() => setInspector('player')}><ArrowLeft size={15} /> 返回设置</button>
      <PanelHeading title="导出视频" note="选择画面方向，然后生成 MP4" />
      <section className="simple-section">
        <h3>画面方向</h3>
        <div className="choice-grid orientation-choices">
          <button className={!portrait ? 'selected' : ''} onClick={() => setOrientation(false)}><Monitor size={20} /><b>横屏</b><span>适合电脑与电视</span></button>
          <button className={portrait ? 'selected' : ''} onClick={() => setOrientation(true)}><Smartphone size={20} /><b>竖屏</b><span>适合短视频平台</span></button>
        </div>
        <p className="format-note"><Check size={13} /> 1080p · 30 FPS · MP4</p>
      </section>
      {status === 'rendering' && (
        <div className="export-progress">
          <div><span style={{ width: `${progress * 100}%` }} /></div>
          <b>{Math.round(progress * 100)}%</b>
          <small>{estimate ? `约剩余 ${formatTime(estimate / 1000)}` : '正在准备画面…'}</small>
          <button onClick={() => { void window.spinframe.cancelExport(); setStatus('idle') }}><X size={14} /> 取消</button>
        </div>
      )}
      {status === 'done' && outputPath && (
        <div className="export-complete">
          <b>视频已生成</b>
          <span title={outputPath}>{outputPath}</span>
          <button onClick={() => void window.spinframe.showItemInFolder(outputPath)}><FolderOpen size={15} /> 打开文件夹</button>
        </div>
      )}
      {status === 'idle' && <button className="export-start" onClick={() => void start()}><Play size={16} fill="currentColor" /> 生成 MP4</button>}
    </>
  )
}

function BasicSettings({ project }: { project: VideoProject }): JSX.Element {
  const update = useEditorStore((state) => state.updateProject)
  const setFocusPicking = useEditorStore((state) => state.setFocusPicking)
  const focusPicking = useEditorStore((state) => state.focusPicking)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)

  const pickFocus = (): void => {
    if (!project.transitionVideo) return
    const nextActive = !focusPicking
    setPlaying(false)
    if (nextActive) setPlayhead(Math.max(0, project.transition.startTime * 0.7))
    setFocusPicking(nextActive)
  }

  const setDuration = (duration: number): void => update((next) => {
    next.player.duration = duration
    const minimumPlayerScene = Math.min(0.75, duration * 0.15)
    const latestTransitionStart = Math.max(0, duration - next.transition.duration - minimumPlayerScene)
    next.transition.startTime = Math.min(next.transition.startTime, latestTransitionStart)
    return next
  })

  return (
    <>
      <PanelHeading title="完成设置" note="只需确认下面三项" />
      <section className="simple-section">
        <h3>1. 歌曲信息</h3>
        <label className="text-field"><span>歌曲名</span><input value={project.title} onChange={(event) => update((next) => { next.title = event.target.value; return next })} /></label>
        <label className="text-field"><span>歌手</span><input value={project.artist} onChange={(event) => update((next) => { next.artist = event.target.value; return next })} /></label>
      </section>
      <section className="simple-section">
        <h3>2. 光盘中心</h3>
        <p>让真实光盘准确转场为黑胶唱片。</p>
        <button className={`focus-button${focusPicking ? ' active' : ''}`} disabled={!project.transitionVideo} onClick={pickFocus}>
          <Crosshair size={18} />
          {!project.transitionVideo ? '请先添加转场素材' : focusPicking ? '请在预览中点击光盘中心' : '选择光盘中心'}
        </button>
      </section>
      <section className="simple-section">
        <h3>3. 成片时长</h3>
        <p>包含转场和主画面，导出文件将严格使用所选时长。</p>
        <div className="duration-choices">
          {[5, 10, 15, 30].map((duration) => <button key={duration} className={project.player.duration === duration ? 'selected' : ''} onClick={() => setDuration(duration)}>{duration} 秒</button>)}
        </div>
      </section>
      <p className="ready-note"><Check size={14} /> 其余动画与排版已由模板自动完成</p>
    </>
  )
}

export function InspectorPanel({ project }: { project: VideoProject }): JSX.Element {
  const section = useEditorStore((state) => state.inspector)
  return <aside className="inspector-panel">{section === 'export' ? <ExportSettings project={project} /> : <BasicSettings project={project} />}</aside>
}
