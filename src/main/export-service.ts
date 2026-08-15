import { app, BrowserWindow, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { once } from 'node:events'
import { basename, dirname, extname, join } from 'node:path'
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
    this.validateRequest(request, duration)
    const frameCount = Math.ceil(duration * request.fps)
    const partialPath = this.partialOutputPath(request.outputPath)
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
      await fs.mkdir(dirname(request.outputPath), { recursive: true })
      const args = this.ffmpegArgs(request, project, duration, partialPath)
      const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] })
      this.activeProcess = ffmpeg
      let ffmpegError = ''
      let processFailure: Error | undefined
      ffmpeg.stderr.on('data', (chunk) => {
        ffmpegError = `${ffmpegError}${chunk.toString()}`.slice(-12000)
      })
      ffmpeg.stdin.on('error', (error) => {
        processFailure ??= error
      })
      const processDone = new Promise<void>((resolve, reject) => {
        ffmpeg.once('error', (error) => reject(error))
        ffmpeg.once('close', (code) => {
          if (this.cancelled) reject(new Error('Export cancelled'))
          else if (code === 0) resolve()
          else reject(new Error(`FFmpeg exited with code ${code}. ${ffmpegError.slice(-1000)}`))
        })
      })
      void processDone.catch((error: unknown) => {
        processFailure = error instanceof Error ? error : new Error(String(error))
      })
      await new Promise<void>((resolve, reject) => {
        ffmpeg.once('spawn', resolve)
        ffmpeg.once('error', reject)
      })

      for (let frame = 0; frame < frameCount; frame += 1) {
        if (this.cancelled) throw new Error('Export cancelled')
        if (processFailure) throw processFailure
        const time = frame / request.fps
        await exportWindow.webContents.executeJavaScript(`window.spinframeExport.prepareFrame(${time})`)
        let image = await exportWindow.webContents.capturePage()
        if (image.isEmpty()) throw new Error(`The export renderer returned an empty frame at ${time.toFixed(3)}s`)
        const size = image.getSize()
        if (size.width !== request.width || size.height !== request.height) {
          image = image.resize({ width: request.width, height: request.height, quality: 'best' })
        }
        if (!ffmpeg.stdin.write(image.toBitmap())) {
          await Promise.race([
            once(ffmpeg.stdin, 'drain'),
            processDone.then(() => { throw new Error('FFmpeg closed before all frames were written') })
          ])
        }
        if (processFailure) throw processFailure
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
      if (this.cancelled) throw new Error('Export cancelled')
      await this.validateOutput(ffmpegPath, partialPath)
      await fs.rm(request.outputPath, { force: true })
      await fs.rename(partialPath, request.outputPath)
      return { outputPath: request.outputPath }
    } catch (error) {
      await this.stopActiveProcess()
      await fs.rm(partialPath, { force: true }).catch(() => undefined)
      throw error
    } finally {
      this.activeProcess = undefined
      if (!exportWindow.isDestroyed()) exportWindow.destroy()
    }
  }

  private async stopActiveProcess(): Promise<void> {
    const process = this.activeProcess
    if (!process || process.exitCode !== null || process.signalCode !== null) return
    process.stdin?.destroy()
    process.kill('SIGTERM')
    await Promise.race([
      once(process, 'close').then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 2000))
    ])
  }

  private validateRequest(request: ExportRequest, duration: number): void {
    if (!request.outputPath.toLowerCase().endsWith('.mp4')) throw new Error('The export path must use the .mp4 extension')
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('The composition duration is invalid')
    if (!Number.isInteger(request.width) || !Number.isInteger(request.height) || request.width <= 0 || request.height <= 0) {
      throw new Error('The export resolution is invalid')
    }
    if (request.width % 2 !== 0 || request.height % 2 !== 0) throw new Error('H.264 export requires an even width and height')
    if (!Number.isFinite(request.fps) || request.fps < 1 || request.fps > 120) throw new Error('The export frame rate is invalid')
    if (!['high', 'balanced', 'compact'].includes(request.quality)) throw new Error('The export quality setting is invalid')
  }

  private partialOutputPath(outputPath: string): string {
    const extension = extname(outputPath) || '.mp4'
    const name = basename(outputPath, extension)
    return join(dirname(outputPath), `.${name}.${process.pid}-${Date.now()}.partial${extension}`)
  }

  private resolveFfmpegPath(): string {
    const installedPath = ffmpegInstaller.path
    if (!installedPath) throw new Error('The bundled FFmpeg binary is unavailable')
    const unpacked = app.isPackaged ? installedPath.replace('app.asar', 'app.asar.unpacked') : installedPath
    if (!existsSync(unpacked)) throw new Error(`FFmpeg was not found at ${unpacked}`)
    return unpacked
  }

  private ffmpegArgs(request: ExportRequest, project: VideoProject, duration: number, outputPath: string): string[] {
    const quality = {
      high: { crf: '16', preset: 'slow' },
      balanced: { crf: '20', preset: 'medium' },
      compact: { crf: '25', preset: 'fast' }
    }[request.quality]
    const inputArgs = [
      '-y', '-f', 'rawvideo', '-pixel_format', 'bgra',
      '-video_size', `${request.width}x${request.height}`, '-framerate', String(request.fps), '-i', 'pipe:0'
    ]
    const resolvedMusicPath = project.music ? this.projectService.resolveMedia(project.music.relativePath) : undefined
    if (project.music && (!resolvedMusicPath || !existsSync(resolvedMusicPath))) {
      throw new Error('The project music file is missing. Replace the music and try exporting again.')
    }
    const musicPath = resolvedMusicPath
    const audioFilter = musicPath
      ? `[1:a:0]atrim=start=${Math.max(0, project.player.musicStartOffset).toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0,apad=pad_dur=${duration.toFixed(3)}[audio]`
      : `[1:a:0]atrim=duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000:first_pts=0[audio]`
    if (musicPath) {
      inputArgs.push('-i', musicPath)
    } else {
      inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
    }
    return [
      ...inputArgs,
      '-filter_complex', audioFilter,
      '-map', '0:v:0', '-map', '[audio]',
      '-c:v', 'libx264', '-preset', quality.preset, '-crf', quality.crf,
      '-pix_fmt', 'yuv420p', '-r', String(request.fps),
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-map_metadata', '-1',
      '-t', duration.toFixed(3), '-movflags', '+faststart', outputPath
    ]
  }

  private async validateOutput(ffmpegPath: string, outputPath: string): Promise<void> {
    const stats = await fs.stat(outputPath)
    if (!stats.isFile() || stats.size < 1024) throw new Error('FFmpeg produced an empty or incomplete MP4 file')
    const validator = spawn(ffmpegPath, [
      '-v', 'error', '-i', outputPath,
      '-map', '0:v:0', '-map', '0:a:0',
      '-f', 'null', '-'
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    this.activeProcess = validator
    let validationError = ''
    validator.stderr.on('data', (chunk) => {
      validationError = `${validationError}${chunk.toString()}`.slice(-4000)
    })
    const code = await new Promise<number | null>((resolve, reject) => {
      validator.once('error', reject)
      validator.once('close', resolve)
    })
    if (code !== 0) throw new Error(`The generated MP4 could not be decoded. ${validationError.slice(-1000)}`)
  }
}
