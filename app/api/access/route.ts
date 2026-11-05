import { NextResponse } from 'next/server'

import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  ACCESS_COOKIE_NAME,
  createAccessCookieValue,
  isCorrectKeyword,
} from '@/lib/access-gate'

export const runtime = 'nodejs'

/** Exchange the family word for a signed session cookie. */
export async function POST(request: Request) {
  let keyword: unknown = ''
  try {
    const body = await request.json()
    keyword = body?.keyword
  } catch {
    // Fall through to the generic failure below.
  }

  if (!(await isCorrectKeyword(keyword))) {
    // Deliberately vague, and identical for empty and wrong input.
    return NextResponse.json({ ok: false, error: 'incorrect' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: await createAccessCookieValue(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}

/** Sign out — mostly useful for testing the gate. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
