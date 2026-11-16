import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { describeStoredBlob, primeNetlifyBlobContextFromHeaders, putBlobFromBuffer } from '@/lib/blob'
import { isSafeSessionId, isSessionAudioPathFor } from '@/lib/session-audio-path'
import { mergeSessionArtifacts } from '@/lib/data'
import { jsonErrorResponse } from '@/lib/api-error'
import { logBlobDiagnostic } from '@/utils/blob-env'

// Long-running: transcription, storage writes and email can exceed the
// platform default, which truncates the request mid-write.
export const maxDuration = 60

const ROUTE_NAME = 'app/api/save-session-audio'

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.parse(JSON.stringify(error))
    } catch {
      return { ...error }
    }
  }
  if (typeof error === 'string') {
    return { message: error }
  }
  return { message: 'Unknown error', value: error }
}

function logRouteEvent(
  level: 'log' | 'error',
  event: string,
  payload?: Record<string, unknown>,
) {
  logBlobDiagnostic(level, event, {
    route: ROUTE_NAME,
    ...(payload ?? {}),
  })
}

// Two ways in. `path` is the normal one: the browser has already uploaded the
// recording straight to storage (see /api/session-audio/upload-url) and is
// telling us where. `audio` is the older inline base64 form, kept as a fallback
// for short recordings when the direct upload is unavailable.
const schema = z
  .object({
    sessionId: z.string().min(1),
    audio: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    mime: z.string().default('audio/webm'),
    duration_ms: z.number().nonnegative().optional(),
  })
  .refine((value) => Boolean(value.audio) !== Boolean(value.path), {
    message: 'Provide exactly one of audio or path',
  })

export async function POST(request: NextRequest) {
  logRouteEvent('log', 'save-session-audio:request:start', {
    url: request.url,
  })
  try {
    primeNetlifyBlobContextFromHeaders(request.headers)
  } catch (error) {
    logRouteEvent('error', 'save-session-audio:prime-context:failed', {
      url: request.url,
      error: serializeError(error),
    })
    throw error
  }
  try {
    const body = await request.json()
    logRouteEvent('log', 'save-session-audio:request:body-parsed', {
      keys: body && typeof body === 'object' ? Object.keys(body) : null,
    })
    const { sessionId, audio, path, mime, duration_ms } = schema.parse(body)
    if (!isSafeSessionId(sessionId)) {
      return NextResponse.json({ ok: false, error: 'invalid_session_id' }, { status: 400 })
    }

    if (path) {
      if (!isSessionAudioPathFor(sessionId, path)) {
        return NextResponse.json({ ok: false, error: 'invalid_audio_path' }, { status: 400 })
      }
      // Trust storage, not the caller: only record the artifact if it is there.
      const stored = await describeStoredBlob(path)
      if (!stored || stored.size === 0) {
        logRouteEvent('error', 'save-session-audio:direct:missing-object', { sessionId, path })
        return NextResponse.json({ ok: false, error: 'audio_not_uploaded' }, { status: 409 })
      }
      await mergeSessionArtifacts(sessionId, {
        artifacts: { session_audio: stored.url },
        durationMs: typeof duration_ms === 'number' ? duration_ms : undefined,
      })
      logRouteEvent('log', 'save-session-audio:direct:success', {
        sessionId,
        path,
        bytes: stored.size,
        durationMs: duration_ms ?? null,
      })
      return NextResponse.json({ ok: true, url: stored.url, durationMs: duration_ms ?? null })
    }
    if (!audio) {
      return NextResponse.json({ ok: false, error: 'missing_audio' }, { status: 400 })
    }

    logRouteEvent('log', 'save-session-audio:request:validated', {
      sessionId,
      mime,
      hasAudio: Boolean(audio),
      durationMs: duration_ms ?? null,
    })

    const buffer = Buffer.from(audio, 'base64')
    const ext = mime.split('/')[1]?.split(';')[0] || 'webm'
    const blob = await putBlobFromBuffer(
      `sessions/${sessionId}/session-audio.${ext}`,
      buffer,
      mime,
      { access: 'public' },
    )

    const url = blob.downloadUrl || blob.url

    logRouteEvent('log', 'save-session-audio:upload:success', {
      sessionId,
      mime,
      bytes: buffer.byteLength,
      url: url || null,
    })

    await mergeSessionArtifacts(sessionId, {
      artifacts: { session_audio: url },
      durationMs: typeof duration_ms === 'number' ? duration_ms : undefined,
    })

    logRouteEvent('log', 'save-session-audio:artifacts:merged', {
      sessionId,
      durationMs: typeof duration_ms === 'number' ? duration_ms : null,
    })

    const responsePayload = { ok: true, url, durationMs: duration_ms ?? null }
    logRouteEvent('log', 'save-session-audio:success', {
      sessionId,
      url: url || null,
      durationMs: duration_ms ?? null,
    })
    return NextResponse.json(responsePayload)
  } catch (error) {
    logRouteEvent('error', 'save-session-audio:failed', {
      url: request.url,
      error: serializeError(error),
    })
    return jsonErrorResponse(error, 'Failed to save session audio', 400, {
      reason: 'save_session_audio_failed',
    })
  }
}
