import { app, BrowserWindow, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { once } from 'node:events'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import type { VideoProject } from '../shared/project'
import { totalDuration } from '../shared/project'
import type { ExportRequest } from '../shared/api'
import type { ProjectService } from './project-service'

export class ExportService {
  private activeProcess?: ChildProcess
  private cancelled = false

  constructor(
    private readonly projectService: ProjectService,
    private readonly preloadPath: string,
    private readonly rendererUrl: string | undefined,
    private readonly rendererFile: string
  ) {}

  cancel(): void {
    this.cancelled = true
    this.activeProcess?.kill('SIGTERM')
  }

  async render(request: ExportRequest, sender: WebContents): Promise<{ outputPath: string }> {
    if (this.activeProcess) throw new Error('An export is already in progress')
    this.cancelled = false
    const project = this.projectService.getProject()
    const duration = totalDuration(project)
    const frameCount = Math.ceil(duration * request.fps)
    const exportWindow = new BrowserWindow({
      show: false,
      width: request.width,
      height: request.height,
      useContentSize: true,
      backgroundColor: project.palette.paper,
      webPreferences: {
        preload: this.preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })

    try {
      if (this.rendererUrl) {
        const url = new URL(this.rendererUrl)
        url.searchParams.set('export', '1')
        await exportWindow.loadURL(url.toString())
      } else {
        await exportWindow.loadFile(this.rendererFile, { query: { export: '1' } })
      }
      exportWindow.webContents.setZoomFactor(1)
      await exportWindow.webContents.executeJavaScript(`Promise.race([
        window.spinframeExport.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Export renderer did not become ready')), 20000))
      ])`)

      const ffmpegPath = this.resolveFfmpegPath()
      const args = this.ffmpegArgs(request, project, duration)
      const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] })
      this.activeProcess = ffmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg.once('spawn', resolve)
        ffmpeg.once('error', reject)
      })
      let ffmpegError = ''
      ffmpeg.stderr.on('data', (chunk) => {
        ffmpegError = `${ffmpegError}${chunk.toString()}`.slice(-12000)
      })
      const processDone = new Promise<void>((resolve, reject) => {
        ffmpeg.once('error', reject)
        ffmpeg.once('close', (code) => {
          if (this.cancelled) reject(new Error('Export cancelled'))
          else if (code === 0) resolve()
          else reject(new Error(`FFmpeg exited with code ${code}. ${ffmpegError.slice(-1000)}`))
        })
      })

      for (let frame = 0; frame < frameCount; frame += 1) {
        if (this.cancelled) throw new Error('Export cancelled')
        const time = frame / request.fps
        await exportWindow.webContents.executeJavaScript(`window.spinframeExport.prepareFrame(${time})`)
        let image = await exportWindow.webContents.capturePage()
        const size = image.getSize()
        if (size.width !== request.width || size.height !== request.height) {
          image = image.resize({ width: request.width, height: request.height, quality: 'best' })
        }
        if (!ffmpeg.stdin.write(image.toBitmap())) await once(ffmpeg.stdin, 'drain')
        if (frame % Math.max(1, Math.floor(frameCount / 200)) === 0 || frame === frameCount - 1) {
          sender.send('export:progress', {
            frame: frame + 1,
            totalFrames: frameCount,
            progress: (frame + 1) / frameCount
          })
        }
      }
      ffmpeg.stdin.end()
      await processDone
      return { outputPath: request.outputPath }
    } finally {
      this.activeProcess = undefined
      if (!exportWindow.isDestroyed()) exportWindow.destroy()
    }
  }

  private resolveFfmpegPath(): string {
    const installedPath = ffmpegInstaller.path
    if (!installedPath) throw new Error('The bundled FFmpeg binary is unavailable')
    const unpacked = app.isPackaged ? installedPath.replace('app.asar', 'app.asar.unpacked') : installedPath
    if (!existsSync(unpacked)) throw new Error(`FFmpeg was not found at ${unpacked}`)
    return unpacked
  }

  private ffmpegArgs(request: ExportRequest, project: VideoProject, duration: number): string[] {
    const quality = {
      high: { crf: '16', preset: 'slow' },
      balanced: { crf: '20', preset: 'medium' },
      compact: { crf: '25', preset: 'fast' }
    }[request.quality]
    const inputArgs = [
      '-y', '-f', 'rawvideo', '-pixel_format', 'bgra',
      '-video_size', `${request.width}x${request.height}`, '-framerate', String(request.fps), '-i', 'pipe:0'
    ]
    const musicPath = project.music ? this.projectService.resolveMedia(project.music.relativePath) : undefined
    if (musicPath) {
      inputArgs.push('-ss', String(Math.max(0, project.player.musicStartOffset)), '-i', musicPath)
    } else {
      inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
    }
    return [
      ...inputArgs,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', quality.preset, '-crf', quality.crf,
      '-pix_fmt', 'yuv420p', '-r', String(request.fps),
      '-c:a', 'aac', '-b:a', '192k', '-af', 'apad',
      '-t', duration.toFixed(3), '-movflags', '+faststart', request.outputPath
    ]
  }
}
