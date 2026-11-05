/**
 * A single shared keyword that lets the family in.
 *
 * This is a front door, not a security boundary. The hash below is a SHA-256 of
 * an ordinary word committed to the repository, so anyone who reads the source
 * and cares to brute-force a dictionary will recover it in milliseconds. It
 * exists to keep casual visitors out of a family's stories, and that is all it
 * claims to do. Real per-person access is still tracked in AI-TODO.md as P0-2.
 *
 * Everything here uses Web Crypto rather than node:crypto because it runs in
 * `middleware.ts`, which executes on the Edge runtime where node:crypto is not
 * available.
 */

/** SHA-256 of "sarva". Override with ACCESS_KEYWORD_HASH to change the word. */
const DEFAULT_KEYWORD_HASH = '81c1e9e6d2a4b5e2f8bedb4c9a677a985d5a53c48e28774824d57c74f40c026a'

export const ACCESS_COOKIE_NAME = 'dadsbot_access'

/** Long-lived on purpose: re-typing a password is a real barrier for the
 *  people this app is for, and the gate is a courtesy rather than a defence. */
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60

function expectedKeywordHash(): string {
  const override = process.env.ACCESS_KEYWORD_HASH?.trim().toLowerCase()
  return override && /^[0-9a-f]{64}$/.test(override) ? override : DEFAULT_KEYWORD_HASH
}

/**
 * Accepts "Sarva", "sarva", " SARVA " and anything else that differs only by
 * case or surrounding whitespace.
 */
export function normalizeKeyword(input: unknown): string {
  return typeof input === 'string' ? input.trim().toLowerCase() : ''
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return toHex(digest)
}

/** Constant-time string comparison, so a wrong guess leaks nothing by timing. */
function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export async function isCorrectKeyword(input: unknown): Promise<boolean> {
  const normalized = normalizeKeyword(input)
  if (!normalized) return false
  return safeEquals(await sha256Hex(normalized), expectedKeywordHash())
}

/**
 * Secret used to sign the session cookie. A dedicated ACCESS_COOKIE_SECRET is
 * preferred; without one we derive from the keyword hash so the gate still
 * works on a deployment that sets no new environment variables at all. Deriving
 * is no weaker than the keyword itself, which is the actual limit here.
 */
function cookieSecret(): string {
  const configured = process.env.ACCESS_COOKIE_SECRET?.trim()
  return configured && configured.length >= 8 ? configured : `derived:${expectedKeywordHash()}`
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(cookieSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toHex(signature)
}

/** Cookie value: `v1.<expiry epoch seconds>.<hmac>` */
export async function createAccessCookieValue(now: number = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + ACCESS_COOKIE_MAX_AGE_SECONDS
  const payload = `v1.${expiresAt}`
  return `${payload}.${await sign(payload)}`
}

export async function isValidAccessCookie(
  value: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!value) return false
  const parts = value.split('.')
  if (parts.length !== 3) return false
  const [version, expiresRaw, signature] = parts
  if (version !== 'v1') return false

  const expiresAt = Number.parseInt(expiresRaw, 10)
  if (!Number.isFinite(expiresAt)) return false
  if (expiresAt * 1000 <= now) return false

  return safeEquals(signature, await sign(`${version}.${expiresRaw}`))
}
