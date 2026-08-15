import { chmod } from 'node:fs/promises'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

if (process.platform !== 'win32' && ffmpegInstaller.path) {
  try {
    await chmod(ffmpegInstaller.path, 0o755)
  } catch (error) {
    console.warn(`Could not prepare FFmpeg executable: ${error instanceof Error ? error.message : String(error)}`)
  }
}
