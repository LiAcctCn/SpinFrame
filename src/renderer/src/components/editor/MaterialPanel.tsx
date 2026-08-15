import { Check, FileAudio, FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import type { AssetKind, MediaAsset, VideoProject } from '@shared/project'
import { isImageAsset, mediaUrl } from '@shared/project'
import { analyzeAudio, extractAccent, probeMedia } from '@/lib/media'
import { useEditorStore } from '@/store/editor'

const items: Array<{ kind: AssetKind; label: string; hint: string; optional?: boolean }> = [
  { kind: 'transitionVideo', label: '转场素材', hint: '包含光盘的照片或视频' },
  { kind: 'cover', label: '专辑封面', hint: '用于黑胶唱片中心' },
  { kind: 'rightVideo', label: '主画面素材', hint: '显示在右侧的照片或视频' },
  { kind: 'music', label: '音乐', hint: 'MP3、M4A、WAV 或 FLAC' },
  { kind: 'lyrics', label: '歌词', hint: 'LRC 文件', optional: true }
]

function assetFor(project: VideoProject, kind: AssetKind): MediaAsset | undefined {
  return kind === 'lyrics' ? project.lyrics?.asset : project[kind]
}

function AssetPreview({ kind, asset }: { kind: AssetKind; asset?: MediaAsset }): JSX.Element {
  const url = mediaUrl(asset)
  if (url && isImageAsset(asset)) return <img src={url} alt="" />
  if (url && (kind === 'transitionVideo' || kind === 'rightVideo')) {
    return (
      <video
        src={url}
        muted
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        preload="metadata"
        onLoadedMetadata={(event) => {
          event.currentTarget.defaultMuted = true
          event.currentTarget.muted = true
          event.currentTarget.volume = 0
        }}
      />
    )
  }
  const Icon = kind === 'music' ? FileAudio : kind === 'lyrics' ? FileText : ImageIcon
  return <Icon size={21} strokeWidth={1.4} />
}

export function MaterialPanel({ project }: { project: VideoProject }): JSX.Element {
  const importAsset = useEditorStore((state) => state.importAsset)
  const removeAsset = useEditorStore((state) => state.removeAsset)
  const updateProject = useEditorStore((state) => state.updateProject)
  const requiredCount = items.slice(0, 4).filter((item) => assetFor(project, item.kind)).length

  const completeImport = async (kind: AssetKind, path?: string): Promise<void> => {
    const asset = await importAsset(kind, path)
    if (!asset || kind === 'lyrics') return
    try {
      const metadata = await probeMedia(asset)
      let peaks: number[] | undefined
      let accent: string | undefined
      if (kind === 'music') peaks = await analyzeAudio(asset)
      if (kind === 'cover') accent = await extractAccent(asset)
      updateProject((next) => {
        const current = next[kind]
        if (current?.id === asset.id) next[kind] = { ...current, ...metadata }
        if (kind === 'transitionVideo' && metadata.duration) {
          const latestMediaStart = Math.max(0.5, metadata.duration - next.transition.duration)
          const latestOutputStart = Math.max(0, next.player.duration - next.transition.duration - 0.75)
          next.transition.startTime = Math.min(latestMediaStart, latestOutputStart, Math.max(0.5, metadata.duration * 0.65))
        }
        if (peaks) next.musicAnalysis = peaks
        if (accent) next.palette.accent = accent
        return next
      })
    } catch {
      // Imported media remains usable when optional analysis is unavailable.
    }
  }

  return (
    <aside className="material-panel">
      <div className="panel-heading">
        <div><b>添加素材</b><span>按顺序完成即可</span></div>
        <small>{requiredCount} / 4</small>
      </div>
      <div className="material-list">
        {items.map((item, index) => {
          const asset = assetFor(project, item.kind)
          const assetDescription = item.kind === 'lyrics' && asset && project.lyrics?.lines.length
            ? `${asset?.name} · ${project.lyrics.lines.length} 行`
            : asset?.name ?? item.hint
          return (
            <div
              key={item.kind}
              className={`material-item${asset ? ' is-ready' : ''}`}
              onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('dragging') }}
              onDragLeave={(event) => event.currentTarget.classList.remove('dragging')}
              onDrop={(event) => {
                event.preventDefault()
                event.currentTarget.classList.remove('dragging')
                const file = event.dataTransfer.files[0]
                if (file) void completeImport(item.kind, window.spinframe.getPathForFile(file))
              }}
            >
              <span className="material-status">{asset ? <Check size={13} strokeWidth={2.2} /> : index + 1}</span>
              <div className="material-thumb"><AssetPreview kind={item.kind} asset={asset} /></div>
              <div className="material-copy">
                <b>{item.label}{item.optional && <em>可选</em>}</b>
                <span title={assetDescription}>{assetDescription}</span>
              </div>
              <div className="material-actions">
                <button className="import-action" onClick={() => void completeImport(item.kind)}><Upload size={13} />{asset ? '更换' : '添加'}</button>
                {asset && <button className="remove-action" title={`移除${item.label}`} onClick={() => removeAsset(item.kind)}><Trash2 size={13} /></button>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="autosave-note"><Check size={12} /> 所有更改都会自动保存</p>
    </aside>
  )
}
