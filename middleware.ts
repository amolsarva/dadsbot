import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import {
  ACCESS_COOKIE_NAME,
  OPERATOR_COOKIE_NAME,
  isCorrectOperatorToken,
  isOperatorPath,
  isValidAccessCookie,
  isValidOperatorCookie,
} from '@/lib/access-gate'

/**
 * Two doors.
 *
 * 1. The family door: anyone without a valid access cookie is sent to /enter.
 * 2. The operator door: diagnostics, the user list, the history fixer and raw
 *    storage tools additionally need an operator cookie (or the
 *    x-operator-token header, for scripts). See lib/access-gate.ts.
 *
 * Paths that must stay reachable with no cookie at all:
 *  - /enter and /api/access, or there would be no way to get in
 *  - /api/health, so uptime checks still work (it returns status only)
 *  - /sounds/* and /logo.svg, which the recorder and header load directly
 * Next's own build assets (/_next/*) are excluded by the matcher below.
 */
const PUBLIC_PATHS = ['/enter', '/api/access', '/api/health', '/logo.svg', '/favicon.ico']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  return pathname.startsWith('/sounds/')
}

async function isOperator(request: NextRequest): Promise<boolean> {
  if (await isValidOperatorCookie(request.cookies.get(OPERATOR_COOKIE_NAME)?.value)) return true
  const header =
    request.headers.get('x-operator-token') ||
    /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ||
    ''
  return isCorrectOperatorToken(header)
}

function sendToDoor(request: NextRequest, reason?: 'operator') {
  const { pathname, search } = request.nextUrl
  const destination = request.nextUrl.clone()
  destination.pathname = '/enter'
  destination.search = ''
  // Remember where they were headed so we can return them there afterwards.
  destination.searchParams.set('next', `${pathname}${search || ''}`)
  if (reason) destination.searchParams.set('for', reason)
  return NextResponse.redirect(destination)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const isApi = pathname.startsWith('/api/')

  if (isOperatorPath(pathname)) {
    if (await isOperator(request)) return NextResponse.next()
    if (isApi) {
      return NextResponse.json(
        { ok: false, error: 'operator_only', message: 'This part of DadsBot is for the person who looks after it.' },
        { status: 403 },
      )
    }
    return sendToDoor(request, 'operator')
  }

  // An operator is always allowed through the family door too.
  if (await isValidAccessCookie(request.cookies.get(ACCESS_COOKIE_NAME)?.value)) return NextResponse.next()
  if (await isOperator(request)) return NextResponse.next()

  // API callers get a status code they can act on; people get the door.
  if (isApi) {
    return NextResponse.json(
      { ok: false, error: 'access_required', message: 'Open the app and enter the family word.' },
      { status: 401 },
    )
  }
  return sendToDoor(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/data).*)'],
}
