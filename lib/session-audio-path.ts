/**
 * Where a session's master recording lives in storage, and the rules for
 * accepting a path from the browser. Shared by the route that issues the
 * upload URL and the route that records the result, so they cannot disagree.
 */

const SAFE_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/

/** Containers a browser recorder can actually produce. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
}

export function isSafeSessionId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SESSION_ID.test(value)
}

/** `audio/webm;codecs=opus` → `webm`. Unknown containers are refused. */
export function extensionForAudioMime(mime: unknown): string | null {
  if (typeof mime !== 'string') return null
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  return EXTENSION_BY_MIME[base] ?? null
}

export function sessionAudioPath(sessionId: string, extension: string): string {
  return `sessions/${sessionId}/session-audio.${extension}`
}

/**
 * True only for the exact object a given session is allowed to claim. The
 * browser tells us where it uploaded; without this check it could point a
 * session's recording at any object in the bucket.
 */
export function isSessionAudioPathFor(sessionId: string, path: unknown): path is string {
  if (!isSafeSessionId(sessionId) || typeof path !== 'string') return false
  const prefix = `sessions/${sessionId}/session-audio.`
  if (!path.startsWith(prefix)) return false
  return Object.values(EXTENSION_BY_MIME).includes(path.slice(prefix.length))
}
