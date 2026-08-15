import { TextDecoder } from 'node:util'

function zeroByteRatio(buffer: Buffer, parity: 0 | 1): number {
  const limit = Math.min(buffer.length, 4096)
  let zeroes = 0
  let samples = 0
  for (let index = parity; index < limit; index += 2) {
    if (buffer[index] === 0) zeroes += 1
    samples += 1
  }
  return samples ? zeroes / samples : 0
}

export function decodeLyricsFile(buffer: Buffer): string {
  let decoded: string
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    decoded = buffer.subarray(2).toString('utf16le')
  } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    decoded = new TextDecoder('utf-16be').decode(buffer.subarray(2))
  } else if (zeroByteRatio(buffer, 1) > 0.3) {
    decoded = buffer.toString('utf16le')
  } else if (zeroByteRatio(buffer, 0) > 0.3) {
    decoded = new TextDecoder('utf-16be').decode(buffer)
  } else {
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      decoded = new TextDecoder('gb18030').decode(buffer)
    }
  }
  return decoded.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}
