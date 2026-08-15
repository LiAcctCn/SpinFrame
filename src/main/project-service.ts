import { app, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { AssetKind, MediaAsset, VideoProject } from '../shared/project'
import { createDemoProject } from '../shared/project'

const PROJECT_FILENAME = 'project.json'
const videoExtensions = ['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv']
const imageExtensions = [
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp',
  ...(process.platform === 'darwin' ? ['.heic', '.heif'] : [])
]
const visualExtensions = [...videoExtensions, ...imageExtensions]

const allowedExtensions: Record<AssetKind, string[]> = {
  transitionVideo: visualExtensions,
  cover: imageExtensions,
  rightVideo: visualExtensions,
  music: ['.mp3', '.m4a', '.aac', '.wav', '.flac'],
  lyrics: ['.lrc', '.txt']
}

const mimeByExtension: Record<string, string> = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.bmp': 'image/bmp',
  '.webp': 'image/webp', '.avif': 'image/avif', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.flac': 'audio/flac', '.lrc': 'text/plain', '.txt': 'text/plain'
}

export class ProjectService {
  private projectDirectory = ''
  private project!: VideoProject

  async initialize(): Promise<void> {
    this.projectDirectory = join(app.getPath('userData'), 'projects', 'demo-project')
    await fs.mkdir(join(this.projectDirectory, 'media'), { recursive: true })
    const projectFile = join(this.projectDirectory, PROJECT_FILENAME)
    let needsSave = false
    try {
      this.project = this.normalizeProject(JSON.parse(await fs.readFile(projectFile, 'utf8')))
    } catch {
      this.project = createDemoProject()
      needsSave = true
    }
    if (await this.installDefaultMusic()) needsSave = true
    if (needsSave) await this.save(this.project)
  }

  getProject(): VideoProject {
    return structuredClone(this.project)
  }

  getProjectDirectory(): string {
    return this.projectDirectory
  }

  resolveMedia(relativePath: string): string | undefined {
    const projectRoot = resolve(this.projectDirectory)
    const target = resolve(projectRoot, normalize(relativePath))
    if (target !== projectRoot && !target.startsWith(`${projectRoot}${process.platform === 'win32' ? '\\' : '/'}`)) return undefined
    return target
  }

  async save(nextProject: VideoProject): Promise<VideoProject> {
    this.project = this.normalizeProject({ ...nextProject, updatedAt: new Date().toISOString() })
    await fs.mkdir(this.projectDirectory, { recursive: true })
    await fs.writeFile(join(this.projectDirectory, PROJECT_FILENAME), JSON.stringify(this.project, null, 2), 'utf8')
    return this.getProject()
  }

  async saveAs(): Promise<{ project: VideoProject; directory: string } | undefined> {
    const result = await dialog.showOpenDialog({
      title: 'Choose a project folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return undefined
    const selected = result.filePaths[0]
    await fs.mkdir(join(selected, 'media'), { recursive: true })

    const oldRoot = this.projectDirectory
    for (const asset of this.assetsInProject()) {
      const source = resolve(oldRoot, asset.relativePath)
      const destination = resolve(selected, asset.relativePath)
      try {
        await fs.mkdir(dirname(destination), { recursive: true })
        await fs.copyFile(source, destination)
      } catch {
        // Missing optional source media should never prevent saving the project.
      }
    }
    this.projectDirectory = selected
    await this.save(this.project)
    return { project: this.getProject(), directory: this.projectDirectory }
  }

  async openProject(): Promise<{ project: VideoProject; directory: string } | undefined> {
    const result = await dialog.showOpenDialog({
      title: 'Open SpinFrame project',
      properties: ['openFile'],
      filters: [{ name: 'SpinFrame Project', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return undefined
    const filePath = result.filePaths[0]
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
    this.projectDirectory = dirname(filePath)
    this.project = this.normalizeProject(parsed)
    return { project: this.getProject(), directory: this.projectDirectory }
  }

  async importAsset(kind: AssetKind, explicitPath?: string): Promise<{ asset: MediaAsset; text?: string } | undefined> {
    let sourcePath = explicitPath
    if (!sourcePath) {
      const result = await dialog.showOpenDialog({
        title: `Import ${this.displayName(kind)}`,
        properties: ['openFile'],
        filters: [{ name: this.displayName(kind), extensions: allowedExtensions[kind].map((value) => value.slice(1)) }]
      })
      if (result.canceled || !result.filePaths[0]) return undefined
      sourcePath = result.filePaths[0]
    }

    const sourceExtension = extname(sourcePath).toLowerCase()
    if (!allowedExtensions[kind].includes(sourceExtension)) {
      throw new Error(`Unsupported ${this.displayName(kind)} format: ${sourceExtension || 'unknown'}`)
    }

    await fs.mkdir(join(this.projectDirectory, 'media'), { recursive: true })
    const convertAppleImage = sourceExtension === '.heic' || sourceExtension === '.heif'
    const targetExtension = convertAppleImage ? '.png' : sourceExtension
    const targetName = `${kind}-${Date.now()}-${randomUUID().slice(0, 6)}${targetExtension}`
    const targetPath = join(this.projectDirectory, 'media', targetName)
    if (convertAppleImage) await this.convertAppleImage(sourcePath, targetPath)
    else await fs.copyFile(sourcePath, targetPath)

    const asset: MediaAsset = {
      id: randomUUID(),
      kind,
      name: basename(sourcePath),
      relativePath: relative(this.projectDirectory, targetPath).split('\\').join('/'),
      mimeType: mimeByExtension[targetExtension] ?? 'application/octet-stream'
    }

    const response: { asset: MediaAsset; text?: string } = { asset }
    if (kind === 'lyrics') response.text = await fs.readFile(targetPath, 'utf8')
    return response
  }

  async readTextAsset(relativePath: string): Promise<string> {
    const path = this.resolveMedia(relativePath)
    if (!path) throw new Error('Invalid project media path')
    return fs.readFile(path, 'utf8')
  }

  private assetsInProject(): MediaAsset[] {
    return [
      this.project.transitionVideo,
      this.project.cover,
      this.project.rightVideo,
      this.project.music,
      this.project.lyrics?.asset
    ].filter((asset): asset is MediaAsset => Boolean(asset))
  }

  private displayName(kind: AssetKind): string {
    return ({
      transitionVideo: 'Transition Material', cover: 'Album Cover', rightVideo: 'Main Visual',
      music: 'Music', lyrics: 'Lyrics'
    })[kind]
  }

  private async convertAppleImage(sourcePath: string, targetPath: string): Promise<void> {
    if (process.platform !== 'darwin') throw new Error('HEIC and HEIF import is only available on macOS')
    try {
      const converter = spawn('/usr/bin/sips', ['-s', 'format', 'png', sourcePath, '--out', targetPath], {
        stdio: ['ignore', 'ignore', 'pipe']
      })
      let diagnostic = ''
      converter.stderr.on('data', (chunk) => {
        diagnostic = `${diagnostic}${chunk.toString()}`.slice(-2000)
      })
      const code = await new Promise<number | null>((resolve, reject) => {
        converter.once('error', reject)
        converter.once('close', resolve)
      })
      if (code !== 0) throw new Error(`The HEIC/HEIF photo could not be converted. ${diagnostic}`)
      const stats = await fs.stat(targetPath)
      if (!stats.isFile() || stats.size === 0) throw new Error('The HEIC/HEIF conversion produced an empty image')
    } catch (error) {
      await fs.rm(targetPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async installDefaultMusic(): Promise<boolean> {
    if (this.project.music) return false
    const sourcePath = app.isPackaged
      ? join(process.resourcesPath, 'demo', 'music.m4a')
      : join(app.getAppPath(), 'assets', 'demo', 'music.m4a')
    const relativePath = 'media/default-music.m4a'
    const targetPath = join(this.projectDirectory, relativePath)
    try {
      await fs.copyFile(sourcePath, targetPath)
    } catch {
      // A missing optional demo asset must never prevent the editor from starting.
      return false
    }
    this.project.music = {
      id: 'spinframe-default-music',
      kind: 'music',
      name: '2026-08-16 00-16-59.m4a',
      relativePath,
      mimeType: 'audio/mp4',
      duration: 17.98
    }
    this.project.player.musicStartOffset = 0
    return true
  }

  private normalizeProject(value: Partial<VideoProject>): VideoProject {
    const fallback = createDemoProject()
    return {
      ...fallback,
      ...value,
      palette: { ...fallback.palette, ...value.palette },
      transition: {
        ...fallback.transition,
        ...value.transition,
        focusPoint: { ...fallback.transition.focusPoint, ...value.transition?.focusPoint }
      },
      coverTransform: { ...fallback.coverTransform, ...value.coverTransform },
      rightVideoTransform: { ...fallback.rightVideoTransform, ...value.rightVideoTransform },
      player: {
        ...fallback.player,
        ...value.player,
        musicStartOffset: Math.max(0, Number(value.player?.musicStartOffset ?? fallback.player.musicStartOffset) || 0)
      },
      export: { ...fallback.export, ...value.export },
      version: 1
    }
  }
}
