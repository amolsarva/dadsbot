// Thin typed wrapper around the legacy JS audio helpers used on the client
// This avoids TS build errors while reusing the proven implementation.

export type RecordResult = {
  blob: Blob
  durationMs: number
  started: boolean
  stopReason: string
}

const audioBridgeTimestamp = () => new Date().toISOString()

const formatAudioBridgeEnvSummary = () => ({
  hasWindow: typeof window !== 'undefined',
  nodeEnv: process.env.NODE_ENV ?? null,
})

const logAudioBridgeDiagnostic = (
  level: 'log' | 'error',
  step: string,
  detail?: Record<string, unknown>,
) => {
  const payload = { envSummary: formatAudioBridgeEnvSummary(), ...(detail ?? {}) }
  const prefix = `[diagnostic] ${audioBridgeTimestamp()} [lib/audio-bridge] ${step}`
  if (level === 'error') {
    console.error(prefix, payload)
  } else {
    console.log(prefix, payload)
  }
}

async function getModule(): Promise<any> {
  const candidates = ['../src/lib/audio.js', '../src/lib/audio']
  let lastError: unknown = null
  for (const candidate of candidates) {
    logAudioBridgeDiagnostic('log', 'attempt-import', { candidate })
    try {
      // @ts-ignore
      const mod = await import(candidate)
      logAudioBridgeDiagnostic('log', 'import-success', { candidate })
      return mod
    } catch (error) {
      lastError = error
      logAudioBridgeDiagnostic('error', 'import-failed', {
        candidate,
        error: error instanceof Error ? error.message : '__unknown__',
      })
    }
  }

  const errorMessage =
    'Audio helpers unavailable after attempting legacy module imports. Verify build includes src/lib/audio.js.'
  logAudioBridgeDiagnostic('error', 'import-exhausted', {
    error: lastError instanceof Error ? lastError.message : '__unknown__',
  })
  throw new Error(errorMessage)
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


