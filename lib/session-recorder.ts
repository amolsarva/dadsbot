export type SessionRecordingResult = {
  blob: Blob
  mimeType: string
  durationMs: number
}

type PlaybackResult = {
  durationMs: number
}

const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

const recorderTimestamp = () => new Date().toISOString()

const formatRecorderEnvSummary = () => ({
  hasWindow: typeof window !== 'undefined',
  hasNavigator: typeof navigator !== 'undefined',
  nodeEnv: process.env.NODE_ENV ?? null,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent ?? null : null,
})

const recorderLog = (
  level: 'log' | 'error',
  step: string,
  detail?: Record<string, unknown>,
) => {
  const payload = { envSummary: formatRecorderEnvSummary(), ...(detail ?? {}) }
  const prefix = `[diagnostic] ${recorderTimestamp()} [lib/session-recorder] ${step}`
  if (level === 'error') {
    console.error(prefix, payload)
  } else {
    console.log(prefix, payload)
  }
}

const formatRecorderError = (error: unknown) =>
  error instanceof Error
    ? { message: error.message, name: error.name }
    : { message: '__unknown__', name: '__unknown__' }

export class SessionRecorder {
  private audioCtx: AudioContext | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private mimeType: string = 'audio/webm'
  private startedAt = 0

  async start(): Promise<void> {
    if (typeof window === 'undefined') throw new Error('SessionRecorder unavailable')
    if (this.recorder && this.recorder.state === 'recording') {
      recorderLog('log', 'start:already-recording')
      return
    }

    recorderLog('log', 'start:requesting-user-media')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorderLog('log', 'start:user-media-granted')
      const ctx = new AudioContext()
      await ctx.resume()
      recorderLog('log', 'start:audio-context-ready')
      const destination = ctx.createMediaStreamDestination()
      const micSource = ctx.createMediaStreamSource(stream)
      micSource.connect(destination)
      recorderLog('log', 'start:microphone-connected')

      const supportedMime = SUPPORTED_MIME_TYPES.find((candidate) => {
        try {
          const supported = MediaRecorder.isTypeSupported(candidate)
          recorderLog('log', 'start:mime-candidate', { candidate, supported })
          return supported
        } catch (error) {
          recorderLog('error', 'start:mime-check-failed', {
            candidate,
            error: formatRecorderError(error),
          })
          return false
        }
      })

      const recorder = supportedMime
        ? new MediaRecorder(destination.stream, { mimeType: supportedMime })
        : new MediaRecorder(destination.stream)

      this.audioCtx = ctx
      this.destination = destination
      this.micStream = stream
      this.micSource = micSource
      this.recorder = recorder
      this.mimeType = supportedMime || recorder.mimeType || 'audio/webm'
      this.chunks = []
      this.startedAt = performance.now()

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) {
          this.chunks.push(event.data)
        }
      }

      recorder.start()
      recorderLog('log', 'start:recording-began', { mimeType: this.mimeType })
    } catch (error) {
      recorderLog('error', 'start:failed', { error: formatRecorderError(error) })
      this.cleanup()
      throw error instanceof Error ? error : new Error('Session recorder failed to start.')
    }
  }

  async playAssistantBase64(base64: string, _mime?: string): Promise<PlaybackResult> {
    if (!this.audioCtx || !this.destination) {
      recorderLog('error', 'play:missing-context')
      throw new Error('Recorder not started')
    }
    await this.audioCtx.resume()
    recorderLog('log', 'play:decoding-audio')
    const arrayBuffer = SessionRecorder.base64ToArrayBuffer(base64)
    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer.slice(0))
    recorderLog('log', 'play:decoded', { durationMs: Math.round(audioBuffer.duration * 1000) })
    return this.playAudioBuffer(audioBuffer)
  }

  async stop(): Promise<SessionRecordingResult> {
    if (!this.recorder) throw new Error('Recorder not started')

    if (this.recorder.state === 'inactive') {
      return { blob: new Blob([], { type: this.mimeType }), mimeType: this.mimeType, durationMs: 0 }
    }

    return await new Promise<SessionRecordingResult>((resolve) => {
      const recorder = this.recorder as MediaRecorder
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType })
        const durationMs = this.startedAt ? Math.max(0, Math.round(performance.now() - this.startedAt)) : 0
        this.cleanup()
        resolve({ blob, mimeType: this.mimeType, durationMs })
      }
      try {
        recorder.stop()
        recorderLog('log', 'stop:requested')
      } catch (error) {
        recorderLog('error', 'stop:failed', { error: formatRecorderError(error) })
        this.cleanup()
        resolve({ blob: new Blob([], { type: this.mimeType }), mimeType: this.mimeType, durationMs: 0 })
      }
    })
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
        recorderLog('log', 'cancel:stop-requested')
      } catch (error) {
        recorderLog('error', 'cancel:stop-failed', { error: formatRecorderError(error) })
      }
    }
    this.cleanup()
  }

  private playAudioBuffer(audioBuffer: AudioBuffer): Promise<PlaybackResult> {
    if (!this.audioCtx || !this.destination) throw new Error('Recorder not started')
    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.audioCtx.destination)
    source.connect(this.destination)
    const durationMs = Math.round(audioBuffer.duration * 1000)
    return new Promise<PlaybackResult>((resolve, reject) => {
      source.onended = () => resolve({ durationMs })
      try {
        source.start()
        recorderLog('log', 'play:start-requested', { durationMs })
      } catch (err) {
        recorderLog('error', 'play:start-failed', { error: formatRecorderError(err) })
        reject(err instanceof Error ? err : new Error('play_failed'))
      }
    })
  }

  private cleanup() {
    recorderLog('log', 'cleanup:begin')
    try {
      if (this.micSource && this.destination) {
        this.micSource.disconnect(this.destination)
        recorderLog('log', 'cleanup:mic-disconnected')
      }
    } catch (error) {
      recorderLog('error', 'cleanup:mic-disconnect-failed', { error: formatRecorderError(error) })
    }
    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((track) => track.stop())
        recorderLog('log', 'cleanup:tracks-stopped')
      } catch (error) {
        recorderLog('error', 'cleanup:stop-tracks-failed', { error: formatRecorderError(error) })
      }
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close()
        recorderLog('log', 'cleanup:context-closed')
      } catch (error) {
        recorderLog('error', 'cleanup:context-close-failed', { error: formatRecorderError(error) })
      }
    }
    this.audioCtx = null
    this.destination = null
    this.micStream = null
    this.micSource = null
    this.recorder = null
    this.chunks = []
    this.startedAt = 0
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    if (typeof atob === 'undefined') {
      recorderLog('error', 'decode:missing-atob')
      throw new Error('Base64 decoding unavailable in this environment')
    }
    const binary = atob(base64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    recorderLog('log', 'decode:converted', { length: len })
    return bytes.buffer
  }
}

export function createSessionRecorder() {
  return new SessionRecorder()
}
