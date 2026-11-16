import { beforeEach, describe, expect, it } from 'vitest'
import { __resetRateLimitsForTests, checkRateLimit, clientKeyFromRequest, rateLimitResponse } from '../lib/rate-limit'

const rule = { name: 'test', limit: 3, windowMs: 1000 }

beforeEach(() => __resetRateLimitsForTests())

describe('checkRateLimit', () => {
  it('allows up to the limit, then refuses with a retry time', () => {
    expect(checkRateLimit(rule, 'a', 0).allowed).toBe(true)
    expect(checkRateLimit(rule, 'a', 100).allowed).toBe(true)
    expect(checkRateLimit(rule, 'a', 200)).toMatchObject({ allowed: true, remaining: 0 })
    expect(checkRateLimit(rule, 'a', 400)).toMatchObject({ allowed: false, retryAfterSeconds: 1 })
  })

  it('starts a fresh window once the old one has passed', () => {
    for (let i = 0; i < 4; i += 1) checkRateLimit(rule, 'a', 0)
    expect(checkRateLimit(rule, 'a', 999).allowed).toBe(false)
    expect(checkRateLimit(rule, 'a', 1000).allowed).toBe(true)
  })

  it('keeps callers and rules separate', () => {
    for (let i = 0; i < 4; i += 1) checkRateLimit(rule, 'a', 0)
    expect(checkRateLimit(rule, 'b', 0).allowed).toBe(true)
    expect(checkRateLimit({ ...rule, name: 'other' }, 'a', 0).allowed).toBe(true)
  })
})

describe('rateLimitResponse', () => {
  const request = (ip: string) => new Request('http://localhost/x', { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } })

  it('uses the first forwarded address as the caller', () => {
    expect(clientKeyFromRequest(request('203.0.113.9'))).toBe('203.0.113.9')
    expect(clientKeyFromRequest(new Request('http://localhost/x'))).toBe('unknown')
  })

  it('returns null while allowed and a 429 with Retry-After once over', async () => {
    const one = { name: 'once', limit: 1, windowMs: 60_000 }
    expect(rateLimitResponse(one, request('203.0.113.9'))).toBeNull()
    const blocked = rateLimitResponse(one, request('203.0.113.9'))
    expect(blocked?.status).toBe(429)
    expect(Number(blocked?.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await blocked?.json()).toMatchObject({ ok: false, error: 'rate_limited' })
  })
})
