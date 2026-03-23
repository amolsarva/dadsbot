import { NextRequest, NextResponse } from 'next/server'
import { primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { runHistoryFixer } from '@/lib/history-fixer'

export async function POST(req: NextRequest) {
  primeNetlifyBlobContextFromHeaders(req.headers)
  let body: { handle?: string | null } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  try {
    const report = await runHistoryFixer({ handle: body.handle ?? null })
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        handle: body.handle ?? null,
        error: err instanceof Error ? err.message : 'unknown_error',
      },
      { status: 500 },
    )
  }
}
