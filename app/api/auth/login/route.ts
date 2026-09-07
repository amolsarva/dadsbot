import { NextRequest, NextResponse } from 'next/server'

import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  createSessionToken,
  resolveRoleForCode,
} from '@/lib/auth'

export const runtime = 'nodejs'

// A simple in-memory limiter on login attempts. This resets on cold start
// and is per-instance, which is a known limitation on serverless — it is a
// deterrent against casual guessing, not a substitute for a strong code.
const ATTEMPTS_WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS_PER_WINDOW = 20
const attemptsByIp = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attemptsByIp.get(ip)
  if (!entry || now - entry.windowStart > ATTEMPTS_WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS_PER_WINDOW
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'too_many_attempts' }, { status: 429 })
  }

  let code: string | undefined
  try {
    const body = await request.json()
    code = typeof body?.code === 'string' ? body.code : undefined
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  const role = resolveRoleForCode(code)
  if (!role) {
    return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 401 })
  }

  let token: string
  try {
    token = await createSessionToken(role)
  } catch (error) {
    console.error('[auth] login:missing-secret', error instanceof Error ? error.message : error)
    return NextResponse.json({ ok: false, error: 'auth_not_configured' }, { status: 500 })
  }

  const response = NextResponse.json({ ok: true, role })
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
