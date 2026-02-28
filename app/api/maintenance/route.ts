import { NextRequest, NextResponse } from 'next/server'
import { listSessions, mergeSessionArtifacts } from '@/lib/data'
import { primeNetlifyBlobContextFromHeaders } from '@/lib/blob'
import { getDigest, updateDigestAfterSession } from '@/lib/conversation-digest'
import { generateSessionTitle, SummarizableTurn } from '@/lib/session-title'

/**
 * POST /api/maintenance
 *
 * Scans sessions for a given handle (or default) and re-summarizes any
 * that are missing AI-generated digest summaries or meaningful titles.
 *
 * Called automatically when the history page loads.
 */
export async function POST(req: NextRequest) {
  primeNetlifyBlobContextFromHeaders(req.headers)

  let body: { handle?: string | null } = {}
  try {
    body = await req.json()
  } catch {}

  const handle = body.handle || null
  const sessions = await listSessions(handle)

  // Load existing digest to see which sessions already have AI summaries
  const existingDigest = await getDigest(handle).catch(() => null)
  const digestSessionIds = new Set(
    existingDigest?.sessions?.map(s => s.sessionId) || []
  )

  // Find sessions that need work:
  // 1. Completed/emailed sessions with turns that aren't in the digest yet
  // 2. Sessions with no stored title
  const needsDigest: typeof sessions = []
  const needsTitle: typeof sessions = []

  for (const s of sessions) {
    const isComplete = s.status === 'completed' || s.status === 'emailed'
    const hasTurns = s.turns && s.turns.length > 0

    if (isComplete && hasTurns && !digestSessionIds.has(s.id)) {
      needsDigest.push(s)
    }

    if (isComplete && hasTurns && !s.title) {
      needsTitle.push(s)
    }
  }

  const results: {
    digested: string[]
    titled: string[]
    skipped: number
    errors: string[]
  } = {
    digested: [],
    titled: [],
    skipped: 0,
    errors: [],
  }

  // Cap to avoid runaway AI calls — process up to 10 sessions per maintenance run
  const digestBatch = needsDigest.slice(0, 10)

  for (const s of digestBatch) {
    try {
      const turns = (s.turns || [])
        .filter(t => t.text && t.text.trim().length > 0)
        .map(t => ({
          role: t.role as 'user' | 'assistant',
          text: t.text,
        }))

      if (turns.length === 0) {
        results.skipped++
        continue
      }

      await updateDigestAfterSession(handle, s.id, turns, {
        date: s.created_at,
        turnCount: s.total_turns,
        durationMs: s.duration_ms,
      })
      results.digested.push(s.id)
    } catch (err) {
      results.errors.push(`digest:${s.id}:${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // Fix missing titles
  for (const s of needsTitle) {
    try {
      const summarizable: SummarizableTurn[] = (s.turns || []).map(t => ({
        role: t.role as 'user' | 'assistant',
        text: t.text,
      }))
      const title = generateSessionTitle(summarizable)
      if (title) {
        await mergeSessionArtifacts(s.id, { title })
        results.titled.push(s.id)
      }
    } catch (err) {
      results.errors.push(`title:${s.id}:${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return NextResponse.json({
    ok: true,
    handle,
    totalSessions: sessions.length,
    ...results,
  })
}
