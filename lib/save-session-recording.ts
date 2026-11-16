/**
 * Browser-side: get a finished session recording into storage.
 *
 * Preferred route is a direct upload to storage with a signed URL, which has
 * no practical size limit. If that is unavailable we fall back to posting the
 * audio inline, but only when it is small enough to fit through an API route —
 * above that the inline request is guaranteed to be rejected by the host, so
 * we report the failure instead of pretending to try.
 */

// The host rejects request bodies over 4.5 MB and base64 adds a third.
export const INLINE_AUDIO_BYTE_LIMIT = 3 * 1024 * 1024

export type SaveRecordingResult =
  | { ok: true; url: string | null; durationMs: number | null; via: 'direct' | 'inline' }
  | { ok: false; reason: string }

type SaveRecordingInput = {
  sessionId: string
  blob: Blob
  mimeType: string
  durationMs: number
  fetchImpl?: typeof fetch
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function saveDirect(input: SaveRecordingInput, doFetch: typeof fetch): Promise<SaveRecordingResult> {
  const ticketRes = await doFetch('/api/session-audio/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: input.sessionId, mime: input.mimeType }),
  })
  const ticket = await readJson(ticketRes)
  if (!ticketRes.ok || !ticket?.ok || typeof ticket.uploadUrl !== 'string' || typeof ticket.path !== 'string') {
    return { ok: false, reason: `upload_url_${ticketRes.status}` }
  }

  const uploadRes = await doFetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': input.mimeType.split(';')[0] || 'application/octet-stream', 'x-upsert': 'true' },
    body: input.blob,
  })
  if (!uploadRes.ok) return { ok: false, reason: `storage_upload_${uploadRes.status}` }

  const confirmRes = await doFetch('/api/save-session-audio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: input.sessionId,
      path: ticket.path,
      mime: input.mimeType,
      duration_ms: input.durationMs,
    }),
  })
  const confirmed = await readJson(confirmRes)
  if (!confirmRes.ok || !confirmed?.ok) return { ok: false, reason: `confirm_${confirmRes.status}` }
  return {
    ok: true,
    url: typeof confirmed.url === 'string' ? confirmed.url : null,
    durationMs: typeof confirmed.durationMs === 'number' ? confirmed.durationMs : null,
    via: 'direct',
  }
}

async function saveInline(input: SaveRecordingInput, doFetch: typeof fetch): Promise<SaveRecordingResult> {
  const audio = await blobToBase64(input.blob)
  if (!audio) return { ok: false, reason: 'empty_recording' }
  const res = await doFetch('/api/save-session-audio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: input.sessionId,
      audio,
      mime: input.mimeType,
      duration_ms: input.durationMs,
    }),
  })
  const json = await readJson(res)
  if (!res.ok || !json?.ok) return { ok: false, reason: `inline_${res.status}` }
  return {
    ok: true,
    url: typeof json.url === 'string' ? json.url : null,
    durationMs: typeof json.durationMs === 'number' ? json.durationMs : null,
    via: 'inline',
  }
}

export async function saveSessionRecording(input: SaveRecordingInput): Promise<SaveRecordingResult> {
  const doFetch = input.fetchImpl ?? fetch
  if (!input.blob || input.blob.size === 0) return { ok: false, reason: 'empty_recording' }

  let direct: SaveRecordingResult
  try {
    direct = await saveDirect(input, doFetch)
  } catch (error) {
    direct = { ok: false, reason: error instanceof Error ? `direct_error:${error.message}` : 'direct_error' }
  }
  if (direct.ok) return direct

  if (input.blob.size > INLINE_AUDIO_BYTE_LIMIT) {
    return { ok: false, reason: `${direct.reason}; too large for inline fallback (${input.blob.size} bytes)` }
  }
  try {
    const inline = await saveInline(input, doFetch)
    return inline.ok ? inline : { ok: false, reason: `${direct.reason}; ${inline.reason}` }
  } catch (error) {
    return { ok: false, reason: `${direct.reason}; inline_error` }
  }
}
