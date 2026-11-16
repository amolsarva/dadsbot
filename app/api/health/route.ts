import { NextResponse } from 'next/server'
import { blobHealth, primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { dbHealth } from '@/lib/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public liveness check for uptime monitors.
 *
 * This is the one API route reachable with no cookie, so it says only whether
 * the app is up and whether its two dependencies answered. It used to return
 * environment details, storage configuration and full stack traces; that
 * detail now lives behind the operator door at /api/diagnostics and is written
 * to the server log here.
 */
export async function GET(request: Request) {
  let storage = false
  let database = false

  try {
    primeNetlifyBlobContextFromHeaders(request.headers)
    const blob = await blobHealth()
    storage = Boolean((blob as { ok?: unknown } | null)?.ok)
  } catch (error) {
    console.error('[health] storage check failed', error)
  }

  try {
    const db = await dbHealth()
    database = Boolean((db as { ok?: unknown } | null)?.ok)
  } catch (error) {
    console.error('[health] database check failed', error)
  }

  const ok = storage && database
  return NextResponse.json(
    { ok, status: ok ? 'healthy' : 'degraded', checks: { storage, database } },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}
