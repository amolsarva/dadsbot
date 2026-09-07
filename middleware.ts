import { NextRequest, NextResponse } from 'next/server'

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth'

/**
 * Closed-beta gate. There are no user accounts (see lib/auth.ts) — this only
 * keeps the app from being reachable by anyone who hasn't been given an
 * invite code. Handle-switching inside the app is unaffected; it happens
 * after this gate, not through it.
 */

const UNGATED_API_PREFIXES = ['/api/auth/', '/api/health']

// Routes that require the 'operator' role specifically, not just any valid
// session. Keep this list short; most operator-only surfaces should move to
// an /admin-style path (see AI-TODO.md P1-3) rather than growing this list.
const OPERATOR_ONLY_PATHS = ['/api/users']

export const config = {
  matcher: [
    '/',
    '/u/:path*',
    '/history',
    '/settings',
    '/diagnostics',
    '/session/:path*',
    '/api/:path*',
  ],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  if (isApiRoute && UNGATED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)

  if (!session) {
    if (isApiRoute) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  if (OPERATOR_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    if (session.role !== 'operator') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
  }

  return NextResponse.next()
}
