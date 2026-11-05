import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { ACCESS_COOKIE_NAME, isValidAccessCookie } from '@/lib/access-gate'

/**
 * Keyword front door. Anyone without a valid access cookie is sent to /enter.
 *
 * Paths that must stay reachable without the cookie:
 *  - /enter and /api/access, or there would be no way to get in
 *  - /api/health, so uptime checks still work
 *  - /sounds/* and /logo.svg, which the recorder and header load directly
 * Next's own build assets (/_next/*) are excluded by the matcher below.
 */
const PUBLIC_PATHS = ['/enter', '/api/access', '/api/health', '/logo.svg', '/favicon.ico']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  return pathname.startsWith('/sounds/')
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const cookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value
  if (await isValidAccessCookie(cookie)) return NextResponse.next()

  // API callers get a status code they can act on; people get the door.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'access_required', message: 'Open the app and enter the family word.' },
      { status: 401 },
    )
  }

  const destination = request.nextUrl.clone()
  destination.pathname = '/enter'
  destination.search = ''
  // Remember where they were headed so we can return them there afterwards.
  destination.searchParams.set('next', `${pathname}${search || ''}`)
  return NextResponse.redirect(destination)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/data).*)'],
}
