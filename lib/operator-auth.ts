import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Guard for operator-only surfaces (raw storage writes, destructive tools).
 *
 * It fails CLOSED: with no `OPERATOR_TOKEN` configured nothing is authorised.
 * These endpoints could previously overwrite any family's memory primer or
 * delete the archive object by object with no credential at all, so refusing
 * by default is the only safe posture.
 */
export function isOperatorRequest(request: Request): boolean {
  const configured = process.env.OPERATOR_TOKEN?.trim()
  if (!configured) return false

  const presented =
    request.headers.get('x-operator-token')?.trim() ||
    parseBearer(request.headers.get('authorization'))

  if (!presented) return false
  return safeEquals(presented, configured)
}

function parseBearer(header: string | null): string {
  if (!header) return ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : ''
}

/**
 * Constant-time comparison. The values are HMAC'd first so that inputs of
 * differing length can still be compared without leaking length via an early
 * return, and so timingSafeEqual always receives equal-sized buffers.
 */
function safeEquals(a: string, b: string): boolean {
  const key = 'dadsbot-operator-compare'
  const digestA = createHmac('sha256', key).update(a).digest()
  const digestB = createHmac('sha256', key).update(b).digest()
  return timingSafeEqual(digestA, digestB)
}

export function operatorForbiddenResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'operator_only',
      message:
        'This endpoint is restricted to operators. Set OPERATOR_TOKEN and send it as the x-operator-token header.',
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  )
}
