import { NextResponse } from 'next/server'

import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  ACCESS_COOKIE_NAME,
  OPERATOR_COOKIE_MAX_AGE_SECONDS,
  OPERATOR_COOKIE_NAME,
  createAccessCookieValue,
  createOperatorCookieValue,
  isCorrectKeyword,
  isCorrectOperatorToken,
} from '@/lib/access-gate'
import { rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Twenty guesses per ten minutes per address: generous for someone mistyping,
// useless for someone running a word list.
const GUESS_LIMIT = { name: 'access', limit: 20, windowMs: 10 * 60 * 1000 }

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

/** Exchange the family word (or the operator token) for a signed cookie. */
export async function POST(request: Request) {
  const limited = rateLimitResponse(GUESS_LIMIT, request)
  if (limited) return limited

  let keyword: unknown = ''
  try {
    const body = await request.json()
    keyword = body?.keyword
  } catch {
    // Fall through to the generic failure below.
  }

  const operator = await isCorrectOperatorToken(keyword)
  if (!operator && !(await isCorrectKeyword(keyword))) {
    // Deliberately vague, and identical for empty and wrong input.
    return NextResponse.json({ ok: false, error: 'incorrect' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, role: operator ? 'operator' : 'family' })
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: await createAccessCookieValue(),
    ...cookieOptions(ACCESS_COOKIE_MAX_AGE_SECONDS),
  })
  if (operator) {
    response.cookies.set({
      name: OPERATOR_COOKIE_NAME,
      value: await createOperatorCookieValue(),
      ...cookieOptions(OPERATOR_COOKIE_MAX_AGE_SECONDS),
    })
  }
  return response
}

/** Sign out — clears both doors. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  for (const name of [ACCESS_COOKIE_NAME, OPERATOR_COOKIE_NAME]) {
    response.cookies.set({ name, value: '', ...cookieOptions(0) })
  }
  return response
}
