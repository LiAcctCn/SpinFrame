import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AssetKind, VideoProject } from '../shared/project'
import type { ExportProgress, ExportRequest, SpinFrameApi } from '../shared/api'

const api: SpinFrameApi = {
  getProject: (): Promise<VideoProject> => ipcRenderer.invoke('project:get'),
  saveProject: (project: VideoProject): Promise<VideoProject> => ipcRenderer.invoke('project:save', project),
  saveProjectAs: () => ipcRenderer.invoke('project:saveAs'),
  openProject: () => ipcRenderer.invoke('project:open'),
  importAsset: (kind: AssetKind, path?: string) => ipcRenderer.invoke('asset:import', kind, path),
  readTextAsset: (relativePath: string): Promise<string> => ipcRenderer.invoke('asset:readText', relativePath),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  chooseExportPath: (suggestedName: string): Promise<string | undefined> => ipcRenderer.invoke('export:choosePath', suggestedName),
  startExport: (request: ExportRequest): Promise<{ outputPath: string }> => ipcRenderer.invoke('export:start', request),
  cancelExport: (): Promise<void> => ipcRenderer.invoke('export:cancel'),
  showItemInFolder: (path: string): Promise<void> => ipcRenderer.invoke('shell:showItem', path),
  onExportProgress: (listener: (progress: ExportProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: ExportProgress): void => listener(value)
    ipcRenderer.on('export:progress', handler)
    return () => { ipcRenderer.removeListener('export:progress', handler) }
  }
}

contextBridge.exposeInMainWorld('spinframe', api)
