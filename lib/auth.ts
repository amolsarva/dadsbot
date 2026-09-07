/**
 * Minimal session auth for a closed beta.
 *
 * There are no user accounts. A visitor who knows one of the invite codes set
 * in env gets a signed, httpOnly cookie granting either 'guest' or 'operator'
 * access to the whole app — not to one handle. Handle-switching inside the
 * app (the account switcher in app/page.tsx) is an in-app convenience for one
 * household sharing a device, not a privilege boundary, so the gate sits in
 * front of the app as a whole rather than per handle.
 *
 * Built on the Web Crypto API (`crypto.subtle`), not `node:crypto`, because
 * this module is imported by middleware.ts, which Next.js runs on the Edge
 * runtime — `node:crypto` is unavailable there. Web Crypto works in both the
 * Edge runtime and Node 20+, so one implementation covers both callers.
 */

export const SESSION_COOKIE_NAME = 'dadsbot_session'

export type SessionRole = 'guest' | 'operator'

type SessionPayload = {
  role: SessionRole
  iat: number
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

const encoder = new TextEncoder()

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecodeToBytes(input: string): Uint8Array | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

function base64UrlEncodeString(input: string): string {
  return base64UrlEncodeBytes(encoder.encode(input))
}

function base64UrlDecodeToString(input: string): string | null {
  const bytes = base64UrlDecodeToBytes(input)
  if (!bytes) return null
  try {
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || !secret.trim().length) {
    throw new Error(
      'AUTH_SECRET is required to sign and verify session cookies. Set it to a long random string.',
    )
  }
  return secret
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

/** Build a signed session cookie value for the given role. */
export async function createSessionToken(role: SessionRole): Promise<string> {
  const secret = getAuthSecret()
  const payload: SessionPayload = { role, iat: Math.floor(Date.now() / 1000) }
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload))
  const key = await importHmacKey(secret, ['sign'])
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload)))
  return `${encodedPayload}.${base64UrlEncodeBytes(signatureBytes)}`
}

/**
 * Verify a session cookie value. Returns the session payload if the
 * signature is valid and the session has not expired, otherwise null.
 *
 * Never throws on malformed input — a forged or corrupt cookie is treated as
 * unauthenticated, not as a server error.
 */
export async function verifySessionToken(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encodedPayload, signature] = parts

  let secret: string
  try {
    secret = getAuthSecret()
  } catch {
    return null
  }

  const signatureBytes = base64UrlDecodeToBytes(signature)
  if (!signatureBytes) return null

  const key = await importHmacKey(secret, ['verify'])
  const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(encodedPayload))
  if (!isValid) return null

  const decoded = base64UrlDecodeToString(encodedPayload)
  if (!decoded) return null

  let payload: SessionPayload
  try {
    payload = JSON.parse(decoded)
  } catch {
    return null
  }

  if (payload.role !== 'guest' && payload.role !== 'operator') return null
  if (typeof payload.iat !== 'number') return null
  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return null

  return payload
}

/** Constant-time-ish comparison of two short strings (invite codes). */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i += 1) {
    diff |= bufA[i] ^ bufB[i]
  }
  return diff === 0
}

/**
 * Check an invite code against the configured codes for each role. Operator
 * is checked first so a code that happens to match both env vars (e.g. both
 * left unset) never silently grants the higher role.
 */
export function resolveRoleForCode(code: string | null | undefined): SessionRole | null {
  if (!code || !code.trim().length) return null
  const trimmed = code.trim()

  const operatorCode = process.env.BETA_OPERATOR_CODE?.trim()
  if (operatorCode && constantTimeEquals(trimmed, operatorCode)) return 'operator'

  const guestCode = process.env.BETA_ACCESS_CODE?.trim()
  if (guestCode && constantTimeEquals(trimmed, guestCode)) return 'guest'

  return null
}

export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS
