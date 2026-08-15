import type { AssetKind, MediaAsset, VideoProject } from './project'

export interface ExportRequest {
  outputPath: string
  width: number
  height: number
  fps: number
  quality: VideoProject['export']['quality']
}

export interface ExportProgress {
  frame: number
  totalFrames: number
  progress: number
}

export interface SpinFrameApi {
  getProject: () => Promise<VideoProject>
  saveProject: (project: VideoProject) => Promise<VideoProject>
  saveProjectAs: () => Promise<{ project: VideoProject; directory: string } | undefined>
  openProject: () => Promise<{ project: VideoProject; directory: string } | undefined>
  importAsset: (kind: AssetKind, path?: string) => Promise<{ asset: MediaAsset; text?: string } | undefined>
  readTextAsset: (relativePath: string) => Promise<string>
  getPathForFile: (file: File) => string
  chooseExportPath: (suggestedName: string) => Promise<string | undefined>
  startExport: (request: ExportRequest) => Promise<{ outputPath: string }>
  cancelExport: () => Promise<void>
  showItemInFolder: (path: string) => Promise<void>
  onExportProgress: (listener: (progress: ExportProgress) => void) => () => void
}
