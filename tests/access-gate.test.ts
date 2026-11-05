import { afterEach, describe, expect, it } from 'vitest'
import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  createAccessCookieValue,
  isCorrectKeyword,
  isValidAccessCookie,
  normalizeKeyword,
} from '../lib/access-gate'

const originalHash = process.env.ACCESS_KEYWORD_HASH
const originalSecret = process.env.ACCESS_COOKIE_SECRET

afterEach(() => {
  if (originalHash === undefined) delete process.env.ACCESS_KEYWORD_HASH
  else process.env.ACCESS_KEYWORD_HASH = originalHash
  if (originalSecret === undefined) delete process.env.ACCESS_COOKIE_SECRET
  else process.env.ACCESS_COOKIE_SECRET = originalSecret
})

describe('normalizeKeyword', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(normalizeKeyword('Sarva')).toBe('sarva')
    expect(normalizeKeyword('  SARVA  ')).toBe('sarva')
    expect(normalizeKeyword('sArVa')).toBe('sarva')
  })

  it('returns an empty string for non-strings', () => {
    expect(normalizeKeyword(undefined)).toBe('')
    expect(normalizeKeyword(null)).toBe('')
    expect(normalizeKeyword(42)).toBe('')
  })
})

describe('isCorrectKeyword', () => {
  it('accepts the keyword in any casing', async () => {
    expect(await isCorrectKeyword('sarva')).toBe(true)
    expect(await isCorrectKeyword('Sarva')).toBe(true)
    expect(await isCorrectKeyword('SARVA')).toBe(true)
    expect(await isCorrectKeyword('  Sarva ')).toBe(true)
  })

  it('rejects anything else', async () => {
    expect(await isCorrectKeyword('')).toBe(false)
    expect(await isCorrectKeyword('   ')).toBe(false)
    expect(await isCorrectKeyword('sarv')).toBe(false)
    expect(await isCorrectKeyword('sarvaa')).toBe(false)
    expect(await isCorrectKeyword('dadsbot')).toBe(false)
    expect(await isCorrectKeyword(undefined)).toBe(false)
    expect(await isCorrectKeyword({ keyword: 'sarva' })).toBe(false)
  })

  it('honours an ACCESS_KEYWORD_HASH override', async () => {
    // sha256("othersecret")
    process.env.ACCESS_KEYWORD_HASH =
      'd8f4ee5cfe0a0d69adf2e00e66e66bd5e4e9f6b09b58f4c4e2a4e2ee0f0f0000'
    expect(await isCorrectKeyword('sarva')).toBe(false)
  })

  it('ignores a malformed override rather than locking everyone out', async () => {
    process.env.ACCESS_KEYWORD_HASH = 'not-a-sha256'
    expect(await isCorrectKeyword('sarva')).toBe(true)
  })
})

describe('access cookie', () => {
  it('round-trips a freshly issued cookie', async () => {
    const value = await createAccessCookieValue()
    expect(await isValidAccessCookie(value)).toBe(true)
  })

  it('rejects missing, malformed or empty values', async () => {
    expect(await isValidAccessCookie(undefined)).toBe(false)
    expect(await isValidAccessCookie('')).toBe(false)
    expect(await isValidAccessCookie('nonsense')).toBe(false)
    expect(await isValidAccessCookie('v1.123')).toBe(false)
    expect(await isValidAccessCookie('v2.9999999999.abc')).toBe(false)
  })

  it('rejects a forged signature', async () => {
    const value = await createAccessCookieValue()
    const [version, expires] = value.split('.')
    expect(await isValidAccessCookie(`${version}.${expires}.${'0'.repeat(64)}`)).toBe(false)
  })

  it('rejects a tampered expiry, so the cookie cannot be extended by hand', async () => {
    const value = await createAccessCookieValue()
    const [version, expires, signature] = value.split('.')
    const extended = Number.parseInt(expires, 10) + 60 * 60
    expect(await isValidAccessCookie(`${version}.${extended}.${signature}`)).toBe(false)
  })

  it('rejects an expired cookie', async () => {
    const value = await createAccessCookieValue()
    const wellPastExpiry = Date.now() + (ACCESS_COOKIE_MAX_AGE_SECONDS + 60) * 1000
    expect(await isValidAccessCookie(value, wellPastExpiry)).toBe(false)
  })

  it('does not accept a cookie signed with a different secret', async () => {
    process.env.ACCESS_COOKIE_SECRET = 'first-secret-value'
    const value = await createAccessCookieValue()
    process.env.ACCESS_COOKIE_SECRET = 'second-secret-value'
    expect(await isValidAccessCookie(value)).toBe(false)
  })
})
