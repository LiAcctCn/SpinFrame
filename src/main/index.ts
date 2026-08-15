import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { electronApp, is } from '@electron-toolkit/utils'
import type { AssetKind, VideoProject } from '../shared/project'
import { ProjectService } from './project-service'
import { ExportService } from './export-service'
import type { ExportRequest } from '../shared/api'

protocol.registerSchemesAsPrivileged([{
  scheme: 'spinframe-media',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}])

app.commandLine.appendSwitch('force-device-scale-factor', '1')

const projectService = new ProjectService()
let mainWindow: BrowserWindow | undefined
let exportService: ExportService | undefined

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#171716',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = undefined })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('project:get', () => projectService.getProject())
  ipcMain.handle('project:save', (_event, project: VideoProject) => projectService.save(project))
  ipcMain.handle('project:saveAs', () => projectService.saveAs())
  ipcMain.handle('project:open', () => projectService.openProject())
  ipcMain.handle('asset:import', (_event, kind: AssetKind, explicitPath?: string) => projectService.importAsset(kind, explicitPath))
  ipcMain.handle('asset:readText', (_event, relativePath: string) => projectService.readTextAsset(relativePath))
  ipcMain.handle('export:choosePath', async (_event, suggestedName: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: `${suggestedName || 'spinframe'}.mp4`,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    })
    return result.canceled ? undefined : result.filePath
  })
  ipcMain.handle('export:start', (event, request: ExportRequest) => exportService?.render(request, event.sender))
  ipcMain.handle('export:cancel', () => exportService?.cancel())
  ipcMain.handle('shell:showItem', (_event, path: string) => shell.showItemInFolder(path))
}

function runSmokeExportIfRequested(): void {
  const argument = process.argv.find((value) => value.startsWith('--smoke-export='))
  if (!argument || !exportService || !mainWindow) return
  const outputPath = argument.slice('--smoke-export='.length)
  const project = projectService.getProject()
  void exportService.render({
    outputPath,
    width: project.export.width,
    height: project.export.height,
    fps: 4,
    quality: 'compact'
  }, mainWindow.webContents).then(() => {
    console.log(`SPINFRAME_SMOKE_EXPORT_OK=${outputPath}`)
  }).catch((error) => {
    process.exitCode = 1
    console.error(`SPINFRAME_SMOKE_EXPORT_FAILED=${error instanceof Error ? error.stack : String(error)}`)
  }).finally(() => app.quit())
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('studio.spinframe.app')
  await projectService.initialize()
  protocol.handle('spinframe-media', (request) => {
    const url = new URL(request.url)
    const relativePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const filePath = projectService.resolveMedia(relativePath)
    if (!filePath) return new Response('Invalid media path', { status: 403 })
    return net.fetch(pathToFileURL(filePath).toString())
  })
  registerIpc()
  exportService = new ExportService(
    projectService,
    join(__dirname, '../preload/index.mjs'),
    is.dev ? process.env.ELECTRON_RENDERER_URL : undefined,
    join(__dirname, '../renderer/index.html')
  )
  createWindow()
  runSmokeExportIfRequested()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
