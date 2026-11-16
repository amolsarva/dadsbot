import { afterEach, describe, expect, it } from 'vitest'
import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  createAccessCookieValue,
  createOperatorCookieValue,
  isCorrectKeyword,
  isCorrectOperatorToken,
  isOperatorPath,
  isValidAccessCookie,
  isValidOperatorCookie,
  normalizeKeyword,
} from '../lib/access-gate'

const originalHash = process.env.ACCESS_KEYWORD_HASH
const originalSecret = process.env.ACCESS_COOKIE_SECRET
const originalWord = process.env.ACCESS_KEYWORD
const originalOperator = process.env.OPERATOR_TOKEN

afterEach(() => {
  if (originalHash === undefined) delete process.env.ACCESS_KEYWORD_HASH
  else process.env.ACCESS_KEYWORD_HASH = originalHash
  if (originalSecret === undefined) delete process.env.ACCESS_COOKIE_SECRET
  else process.env.ACCESS_COOKIE_SECRET = originalSecret
  if (originalWord === undefined) delete process.env.ACCESS_KEYWORD
  else process.env.ACCESS_KEYWORD = originalWord
  if (originalOperator === undefined) delete process.env.OPERATOR_TOKEN
  else process.env.OPERATOR_TOKEN = originalOperator
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

describe('ACCESS_KEYWORD override', () => {
  it('replaces the committed default with a word that is not in the repository', async () => {
    process.env.ACCESS_KEYWORD = '  Marigold '
    expect(await isCorrectKeyword('marigold')).toBe(true)
    expect(await isCorrectKeyword('MARIGOLD ')).toBe(true)
    expect(await isCorrectKeyword('sarva')).toBe(false)
  })

  it('invalidates cookies issued under the previous word', async () => {
    const before = await createAccessCookieValue()
    process.env.ACCESS_KEYWORD = 'marigold'
    expect(await isValidAccessCookie(before)).toBe(false)
    expect(await isValidAccessCookie(await createAccessCookieValue())).toBe(true)
  })
})

describe('operator door', () => {
  const TOKEN = 'a-long-operator-token-123'

  it('is closed to everyone when no token is configured', async () => {
    delete process.env.OPERATOR_TOKEN
    expect(await isCorrectOperatorToken('')).toBe(false)
    expect(await isCorrectOperatorToken('anything')).toBe(false)
    expect(await isValidOperatorCookie('op1.9999999999.abc')).toBe(false)
    await expect(createOperatorCookieValue()).rejects.toThrow()
  })

  it('treats a short token as not configured rather than as a weak lock', async () => {
    process.env.OPERATOR_TOKEN = 'short'
    expect(await isCorrectOperatorToken('short')).toBe(false)
  })

  it('accepts only the exact token', async () => {
    process.env.OPERATOR_TOKEN = TOKEN
    expect(await isCorrectOperatorToken(TOKEN)).toBe(true)
    expect(await isCorrectOperatorToken(` ${TOKEN} `)).toBe(true)
    expect(await isCorrectOperatorToken(TOKEN.toUpperCase())).toBe(false)
    expect(await isCorrectOperatorToken('sarva')).toBe(false)
    expect(await isCorrectOperatorToken(undefined)).toBe(false)
  })

  it('round-trips an operator cookie and rejects forgeries', async () => {
    process.env.OPERATOR_TOKEN = TOKEN
    const value = await createOperatorCookieValue()
    expect(await isValidOperatorCookie(value)).toBe(true)
    const [version, expires] = value.split('.')
    expect(await isValidOperatorCookie(`${version}.${expires}.${'0'.repeat(64)}`)).toBe(false)
    expect(await isValidOperatorCookie(`${version}.${Number(expires) + 60}.${value.split('.')[2]}`)).toBe(false)
  })

  it('does not accept a family cookie as an operator cookie', async () => {
    process.env.OPERATOR_TOKEN = TOKEN
    expect(await isValidOperatorCookie(await createAccessCookieValue())).toBe(false)
  })

  it('stops honouring cookies once the token is rotated', async () => {
    process.env.OPERATOR_TOKEN = TOKEN
    const value = await createOperatorCookieValue()
    process.env.OPERATOR_TOKEN = 'a-different-operator-token-456'
    expect(await isValidOperatorCookie(value)).toBe(false)
  })
})

describe('isOperatorPath', () => {
  it('covers the cross-family and infrastructure surfaces', () => {
    for (const path of [
      '/api/users',
      '/api/diagnostics',
      '/api/diagnostics/env',
      '/api/debug/blobs',
      '/api/history/fixer',
      '/api/history/metrics',
      '/diagnostics',
      '/u/dad/diagnostics',
    ]) {
      expect(isOperatorPath(path), path).toBe(true)
    }
  })

  it('leaves the storyteller surface alone', () => {
    for (const path of [
      '/',
      '/history',
      '/settings',
      '/u/dad',
      '/u/dad/history',
      '/u/diagnostics',
      '/api/history',
      '/api/history/abc123',
      '/api/ask-audio',
      '/api/usersettings',
      '/diagnostics-guide',
    ]) {
      expect(isOperatorPath(path), path).toBe(false)
    }
  })
})
