import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSignedUploadTarget, primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { getSession } from '@/lib/data'
import { rateLimitResponse } from '@/lib/rate-limit'
import { extensionForAudioMime, isSafeSessionId, sessionAudioPath } from '@/lib/session-audio-path'

export const runtime = 'nodejs'
export const maxDuration = 30

const LIMIT = { name: 'session-audio-upload-url', limit: 30, windowMs: 10 * 60 * 1000 }

const schema = z.object({
  sessionId: z.string().min(1),
  mime: z.string().min(1),
})

/**
 * Hand the browser a short-lived URL to upload a session's master recording
 * straight to storage. See createSignedUploadTarget for why the bytes must not
 * pass through an API route.
 */
export async function POST(request: NextRequest) {
  const limited = rateLimitResponse(LIMIT, request)
  if (limited) return limited

  try {
    primeNetlifyBlobContextFromHeaders(request.headers)
    const { sessionId, mime } = schema.parse(await request.json())

    if (!isSafeSessionId(sessionId)) {
      return NextResponse.json({ ok: false, error: 'invalid_session_id' }, { status: 400 })
    }
    const extension = extensionForAudioMime(mime)
    if (!extension) {
      return NextResponse.json({ ok: false, error: 'unsupported_audio_type' }, { status: 400 })
    }
    // Only a session that exists can be given somewhere to upload to.
    const session = await getSession(sessionId)
    if (!session) {
      return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 })
    }

    const target = await createSignedUploadTarget(sessionAudioPath(sessionId, extension))
    return NextResponse.json({ ok: true, uploadUrl: target.uploadUrl, path: target.pathname })
  } catch (error) {
    console.error('[session-audio] could not issue an upload URL', error)
    return NextResponse.json({ ok: false, error: 'upload_url_failed' }, { status: 500 })
  }
}
