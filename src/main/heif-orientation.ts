import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'

interface IsoBox {
  type: string
  dataStart: number
  end: number
}

function boxesIn(buffer: Buffer, start: number, end: number): IsoBox[] {
  const boxes: IsoBox[] = []
  let cursor = start
  while (cursor + 8 <= end) {
    let size = buffer.readUInt32BE(cursor)
    const type = buffer.toString('ascii', cursor + 4, cursor + 8)
    let headerSize = 8
    if (size === 1) {
      if (cursor + 16 > end) break
      const extendedSize = buffer.readBigUInt64BE(cursor + 8)
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) break
      size = Number(extendedSize)
      headerSize = 16
    } else if (size === 0) {
      size = end - cursor
    }
    if (size < headerSize || cursor + size > end) break
    boxes.push({ type, dataStart: cursor + headerSize, end: cursor + size })
    cursor += size
  }
  return boxes
}

function primaryItemId(buffer: Buffer, pitm: IsoBox): number | undefined {
  if (pitm.dataStart + 6 > pitm.end) return undefined
  const version = buffer[pitm.dataStart]
  const offset = pitm.dataStart + 4
  if (version === 0) return buffer.readUInt16BE(offset)
  if (offset + 4 <= pitm.end) return buffer.readUInt32BE(offset)
  return undefined
}

function associatedPropertyIndexes(buffer: Buffer, ipma: IsoBox, itemId: number): number[] {
  if (ipma.dataStart + 8 > ipma.end) return []
  const version = buffer[ipma.dataStart]
  const flags = buffer.readUIntBE(ipma.dataStart + 1, 3)
  const largeAssociations = (flags & 1) !== 0
  let offset = ipma.dataStart + 4
  const entryCount = buffer.readUInt32BE(offset)
  offset += 4

  for (let entry = 0; entry < entryCount; entry += 1) {
    const itemBytes = version < 1 ? 2 : 4
    if (offset + itemBytes + 1 > ipma.end) return []
    const currentItem = itemBytes === 2 ? buffer.readUInt16BE(offset) : buffer.readUInt32BE(offset)
    offset += itemBytes
    const associationCount = buffer[offset]
    offset += 1
    const indexes: number[] = []
    for (let association = 0; association < associationCount; association += 1) {
      const associationBytes = largeAssociations ? 2 : 1
      if (offset + associationBytes > ipma.end) return []
      const raw = associationBytes === 2 ? buffer.readUInt16BE(offset) : buffer[offset]
      offset += associationBytes
      const index = raw & (largeAssociations ? 0x7fff : 0x7f)
      if (index) indexes.push(index)
    }
    if (currentItem === itemId) return indexes
  }
  return []
}

export function heifRotationCcwFromBuffer(buffer: Buffer): number {
  const meta = boxesIn(buffer, 0, buffer.length).find((box) => box.type === 'meta')
  if (meta && meta.dataStart + 4 <= meta.end) {
    const metaChildren = boxesIn(buffer, meta.dataStart + 4, meta.end)
    const pitm = metaChildren.find((box) => box.type === 'pitm')
    const iprp = metaChildren.find((box) => box.type === 'iprp')
    const itemId = pitm ? primaryItemId(buffer, pitm) : undefined
    if (iprp && itemId !== undefined) {
      const propertyChildren = boxesIn(buffer, iprp.dataStart, iprp.end)
      const ipco = propertyChildren.find((box) => box.type === 'ipco')
      const properties = ipco ? boxesIn(buffer, ipco.dataStart, ipco.end) : []
      for (const ipma of propertyChildren.filter((box) => box.type === 'ipma')) {
        for (const index of associatedPropertyIndexes(buffer, ipma, itemId)) {
          const property = properties[index - 1]
          if (property?.type === 'irot' && property.dataStart < property.end) {
            return (buffer[property.dataStart] & 0x03) * 90
          }
        }
      }
    }
  }

  // Some encoders omit a usable property association. A valid irot property is
  // always a nine-byte ISO box, so this guarded fallback cannot match image data.
  for (let offset = 4; offset + 5 <= buffer.length; offset += 1) {
    if (buffer.toString('ascii', offset, offset + 4) !== 'irot') continue
    if (buffer.readUInt32BE(offset - 4) === 9) return (buffer[offset + 4] & 0x03) * 90
  }
  return 0
}

export async function readHeifRotationCcw(path: string): Promise<number> {
  return heifRotationCcwFromBuffer(await fs.readFile(path))
}

async function runSips(args: string[]): Promise<void> {
  const process = spawn('/usr/bin/sips', args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let diagnostic = ''
  process.stderr.on('data', (chunk) => {
    diagnostic = `${diagnostic}${chunk.toString()}`.slice(-2000)
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    process.once('error', reject)
    process.once('close', resolve)
  })
  if (code !== 0) throw new Error(`The HEIC/HEIF photo could not be converted. ${diagnostic}`)
}

export async function convertAppleImageWithOrientation(sourcePath: string, targetPath: string): Promise<void> {
  const rotationCcw = await readHeifRotationCcw(sourcePath)
  const decodedPath = rotationCcw ? `${targetPath}.decoded.png` : targetPath
  try {
    await runSips(['-s', 'format', 'png', sourcePath, '--out', decodedPath])
    if (rotationCcw) {
      const rotationCw = (360 - rotationCcw) % 360
      await runSips(['-r', String(rotationCw), decodedPath, '--out', targetPath])
    }
    const stats = await fs.stat(targetPath)
    if (!stats.isFile() || stats.size === 0) throw new Error('The HEIC/HEIF conversion produced an empty image')
  } catch (error) {
    await fs.rm(targetPath, { force: true }).catch(() => undefined)
    throw error
  } finally {
    if (decodedPath !== targetPath) await fs.rm(decodedPath, { force: true }).catch(() => undefined)
  }
}
