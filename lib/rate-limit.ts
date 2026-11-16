/**
 * A small fixed-window rate limiter.
 *
 * State lives in this process's memory, so on serverless it is per warm
 * instance and resets on cold start. That makes it a brake on a runaway client
 * or a casual abuser — which is what was missing entirely — not a hard quota.
 * A shared store (Upstash, Supabase) is the upgrade path if the beta widens.
 */

type Bucket = { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()
const MAX_TRACKED_KEYS = 5000

export type RateLimitRule = {
  /** Namespace, e.g. the route name. */
  name: string
  limit: number
  windowMs: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(rule: RateLimitRule, subject: string, now: number = Date.now()): RateLimitResult {
  const key = `${rule.name}:${subject}`
  const existing = buckets.get(key)

  if (!existing || now - existing.windowStart >= rule.windowMs) {
    if (buckets.size >= MAX_TRACKED_KEYS) prune(now)
    buckets.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > rule.limit) {
    const retryAfterMs = rule.windowMs - (now - existing.windowStart)
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }
  return { allowed: true, remaining: rule.limit - existing.count, retryAfterSeconds: 0 }
}

function prune(now: number) {
  buckets.forEach((bucket, key) => {
    // Longest window in use is an hour; anything older is certainly expired.
    if (now - bucket.windowStart > 60 * 60 * 1000) buckets.delete(key)
  })
  // Still full of live entries: drop the oldest half rather than grow forever.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const keys = Array.from(buckets.keys()).slice(0, Math.floor(MAX_TRACKED_KEYS / 2))
    keys.forEach((key) => buckets.delete(key))
  }
}

/** Best-effort caller identity: the first forwarded address, as set by the host's proxy. */
export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Returns a ready 429 response when the caller is over the limit, otherwise null.
 * The message is written for the storyteller, who is the one who will see it.
 */
export function rateLimitResponse(rule: RateLimitRule, request: Request): Response | null {
  const result = checkRateLimit(rule, clientKeyFromRequest(request))
  if (result.allowed) return null
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'rate_limited',
      message: 'That was a lot of requests in a short time. Please wait a moment and try again.',
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(result.retryAfterSeconds),
      },
    },
  )
}

export function __resetRateLimitsForTests() {
  buckets.clear()
}
