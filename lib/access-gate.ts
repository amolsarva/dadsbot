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

/**
 * Preferred way to change the word: set ACCESS_KEYWORD to the word itself in
 * the hosting environment. Unlike the committed default it never appears in the
 * repository, so it cannot be read or brute-forced from the source.
 */
function configuredKeyword(): string {
  return normalizeKeyword(process.env.ACCESS_KEYWORD)
}

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
  const hashed = await sha256Hex(normalized)
  const plain = configuredKeyword()
  // Hash both sides so the comparison is equal-length and constant-time.
  if (plain) return safeEquals(hashed, await sha256Hex(plain))
  return safeEquals(hashed, expectedKeywordHash())
}

/**
 * Secret used to sign the session cookie. A dedicated ACCESS_COOKIE_SECRET is
 * preferred; without one we derive from the keyword hash so the gate still
 * works on a deployment that sets no new environment variables at all. Deriving
 * is no weaker than the keyword itself, which is the actual limit here.
 */
function cookieSecret(): string {
  const configured = process.env.ACCESS_COOKIE_SECRET?.trim()
  if (configured && configured.length >= 8) return configured
  const plain = configuredKeyword()
  return plain ? `derived-word:${plain}` : `derived:${expectedKeywordHash()}`
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

/* ---- Operator access -----------------------------------------------------
   The family word above is a courtesy door. The operator surface (diagnostics,
   the user list, the history fixer, raw storage tools) is different: it can
   read across every person's stories and trigger billable provider calls, so
   it needs a real secret. That secret is OPERATOR_TOKEN, which is never
   committed. With no OPERATOR_TOKEN configured the operator surface is closed
   to everyone — it fails shut, not open. */

export const OPERATOR_COOKIE_NAME = 'dadsbot_operator'

/** Short-lived compared with the family cookie: operators can re-type a token. */
export const OPERATOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function operatorToken(): string {
  const token = process.env.OPERATOR_TOKEN?.trim() ?? ''
  // A short token is guessable; treat it as not configured rather than weak.
  return token.length >= 12 ? token : ''
}

export function isOperatorConfigured(): boolean {
  return operatorToken().length > 0
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
}

/** Exact match (after trimming) — the token is a secret, not a friendly word. */
export async function isCorrectOperatorToken(input: unknown): Promise<boolean> {
  const expected = operatorToken()
  if (!expected || typeof input !== 'string') return false
  const presented = input.trim()
  if (!presented) return false
  return safeEquals(await sha256Hex(presented), await sha256Hex(expected))
}

/** Cookie value: `op1.<expiry epoch seconds>.<hmac keyed by OPERATOR_TOKEN>` */
export async function createOperatorCookieValue(now: number = Date.now()): Promise<string> {
  const secret = operatorToken()
  if (!secret) throw new Error('OPERATOR_TOKEN is not configured')
  const payload = `op1.${Math.floor(now / 1000) + OPERATOR_COOKIE_MAX_AGE_SECONDS}`
  return `${payload}.${await hmacHex(secret, payload)}`
}

export async function isValidOperatorCookie(
  value: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  const secret = operatorToken()
  if (!secret || !value) return false
  const parts = value.split('.')
  if (parts.length !== 3) return false
  const [version, expiresRaw, signature] = parts
  if (version !== 'op1') return false
  const expiresAt = Number.parseInt(expiresRaw, 10)
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= now) return false
  return safeEquals(signature, await hmacHex(secret, `${version}.${expiresRaw}`))
}

/**
 * Paths only an operator may reach. Everything here either reads across
 * families, exposes infrastructure detail, or spends money on provider calls.
 */
const OPERATOR_PREFIXES = [
  '/api/users',
  '/api/diagnostics',
  '/api/debug',
  '/api/history/fixer',
  '/api/history/metrics',
  '/diagnostics',
]

export function isOperatorPath(pathname: string): boolean {
  if (OPERATOR_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true
  }
  // Per-person diagnostics pages: /u/<handle>/diagnostics
  return /^\/u\/[^/]+\/diagnostics(\/|$)/.test(pathname)
}
