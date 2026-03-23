import { NextRequest, NextResponse } from 'next/server'
import { primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { getHistoryMetrics } from '@/lib/history-metrics'

export async function GET(req: NextRequest) {
  primeNetlifyBlobContextFromHeaders(req.headers)
  const url = new URL(req.url)
  const handle = url.searchParams.get('handle')
  try {
    const metrics = await getHistoryMetrics({ handle })
    return NextResponse.json(metrics)
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        handle,
        error: err instanceof Error ? err.message : 'unknown_error',
      },
      { status: 500 },
    )
  }
}
