import { Pause, Play, RotateCcw } from 'lucide-react'
import type { VideoProject } from '@shared/project'
import { totalDuration } from '@shared/project'
import { formatTime } from '@shared/timeline'
import { useEditorStore } from '@/store/editor'

export function SimpleTimeline({ project }: { project: VideoProject }): JSX.Element {
  const playhead = useEditorStore((state) => state.playhead)
  const playing = useEditorStore((state) => state.playing)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)
  const duration = totalDuration(project)

  return (
    <footer className="playback-bar">
      <button className="restart-button" title="从头播放" onClick={() => { setPlaying(false); setPlayhead(0) }}><RotateCcw size={16} /></button>
      <button className="play-button" title={playing ? '暂停' : '播放'} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
      <time>{formatTime(playhead)}</time>
      <input aria-label="预览进度" type="range" min={0} max={duration} step={1 / project.export.fps} value={playhead} onChange={(event) => { setPlaying(false); setPlayhead(Number(event.target.value)) }} />
      <time>{formatTime(duration)}</time>
    </footer>
  )
}
