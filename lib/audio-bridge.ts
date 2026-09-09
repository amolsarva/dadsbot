// Thin typed wrapper around the legacy JS audio helpers used on the client
// This avoids TS build errors while reusing the proven implementation.

export type RecordResult = {
  blob: Blob
  durationMs: number
  started: boolean
  stopReason: string
  /** The container the browser actually recorded (webm on Chrome, mp4 on iOS). */
  mimeType?: string
}

/**
 * Maps a MediaRecorder mime type onto the short format label the ask-audio API
 * expects. Sending the wrong label makes the provider decode the bytes as the
 * wrong container, which fails silently on Safari.
 */
export function formatFromMimeType(mimeType?: string | null): string {
  const value = (mimeType || '').toLowerCase()
  if (value.includes('mp4') || value.includes('m4a') || value.includes('aac')) return 'mp4'
  if (value.includes('ogg')) return 'ogg'
  if (value.includes('wav')) return 'wav'
  return 'webm'
}

async function getModule(): Promise<any> {
  // Dynamic import so it only loads client-side
  try {
    // @ts-ignore
    return await import('../src/lib/audio.js')
  } catch {
    // @ts-ignore
    return await import('../src/lib/audio')
  }
}

export async function calibrateRMS(seconds = 2.0): Promise<number> {
  const mod = await getModule()
  return typeof mod.calibrateRMS === 'function' ? await mod.calibrateRMS(seconds) : 0
}

export async function recordUntilSilence(args: any): Promise<RecordResult> {
  const mod = await getModule()
  if (typeof mod.recordUntilSilence !== 'function') throw new Error('Audio recording unavailable')
  return await mod.recordUntilSilence(args)
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const mod = await getModule()
  return typeof mod.blobToBase64 === 'function' ? await mod.blobToBase64(blob) : ''
}


