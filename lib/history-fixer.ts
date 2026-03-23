import { normalizeHandle } from '@/lib/user-scope'
import { listSessions, mergeSessionArtifacts } from '@/lib/data'
import { fetchStoredSessions, StoredSession } from '@/lib/history'
import { clearDigest, updateDigestAfterSession } from '@/lib/conversation-digest'
import { SummarizableTurn, generateSessionTitle } from '@/lib/session-title'
import { formatSessionTitleFallback } from '@/lib/fallback-texts'

export type HistoryFixReport = {
  ok: boolean
  handle: string | null
  processedSessions: number
  digestEntries: number
  skippedSessions: number
  titlesUpdated: number
  storageSessions: number
  supabaseSessions: number
  startedAt: string
  completedAt: string
  durationMs: number
  notes: string[]
}

type CombinedSession = {
  id: string
  createdAt: string
  totalTurns: number
  durationMs: number
  status: string
  title?: string | null
  turns: SummarizableTurn[]
}

function buildTurnsFromStored(session: StoredSession): SummarizableTurn[] {
  const turns: SummarizableTurn[] = []
  for (const turn of session.turns) {
    if (turn.transcript && turn.transcript.trim().length) {
      turns.push({ role: 'user', text: turn.transcript })
    }
    if (turn.assistantReply && turn.assistantReply.trim().length) {
      turns.push({ role: 'assistant', text: turn.assistantReply })
    }
  }
  return turns
}

function buildCombinedSessions(
  supabaseSessions: Awaited<ReturnType<typeof listSessions>>,
  storedSessions: StoredSession[],
): Map<string, CombinedSession> {
  const combined = new Map<string, CombinedSession>()

  for (const session of supabaseSessions) {
    const turns: SummarizableTurn[] = (session.turns || [])
      .filter((t) => t.text && t.text.trim().length)
      .map((t) => ({ role: t.role as 'user' | 'assistant', text: t.text! }))
    combined.set(session.id, {
      id: session.id,
      createdAt: session.created_at,
      totalTurns: session.total_turns,
      durationMs: session.duration_ms ?? 0,
      status: session.status,
      title: session.title,
      turns,
    })
  }

  for (const stored of storedSessions) {
    const turns = buildTurnsFromStored(stored)
    const createdAt = stored.startedAt || stored.endedAt || new Date().toISOString()
    const totalTurns = stored.totalTurns || Math.ceil(turns.length / 2)
    const durationMs = stored.totalDurationMs || 0
    const existing = combined.get(stored.sessionId)
    if (existing) {
      if (!existing.turns.length && turns.length) {
        existing.turns = turns
      }
      if (!existing.title && turns.length) {
        const computedTitle = generateSessionTitle(turns, {
          fallback: formatSessionTitleFallback(createdAt),
        })
        existing.title = computedTitle
      }
      continue
    }
    combined.set(stored.sessionId, {
      id: stored.sessionId,
      createdAt,
      totalTurns,
      durationMs,
      status: 'completed',
      title: turns.length
        ? generateSessionTitle(turns, { fallback: formatSessionTitleFallback(createdAt) })
        : undefined,
      turns,
    })
  }

  return combined
}

export async function runHistoryFixer(options: { handle?: string | null } = {}): Promise<HistoryFixReport> {
  const startedAt = new Date().toISOString()
  const normalizedHandle = normalizeHandle(options.handle ?? undefined)
  const notes: string[] = []

  let supabaseSessions: Awaited<ReturnType<typeof listSessions>> = []
  try {
    supabaseSessions = await listSessions(normalizedHandle)
  } catch (err) {
    notes.push(`Supabase sessions unavailable: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  let storedSessions: StoredSession[] = []
  try {
    const storedResult = await fetchStoredSessions({ handle: normalizedHandle ?? null, limit: 250 })
    storedSessions = storedResult.items
  } catch (err) {
    notes.push(`Stored sessions unavailable: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  const combined = buildCombinedSessions(supabaseSessions, storedSessions)
  const sorted = Array.from(combined.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  await clearDigest(normalizedHandle ?? null)

  let digestEntries = 0
  let skippedSessions = 0
  let titlesUpdated = 0

  for (const session of sorted) {
    if (!session.turns.length) {
      skippedSessions += 1
      continue
    }

    try {
      await updateDigestAfterSession(normalizedHandle ?? null, session.id, session.turns, {
        date: session.createdAt,
        turnCount: session.totalTurns || session.turns.length,
        durationMs: session.durationMs,
      })
      digestEntries += 1
    } catch (err) {
      notes.push(`Digest update failed for ${session.id}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }

    if (!session.title && session.turns.length) {
      const computedTitle = generateSessionTitle(session.turns, {
        fallback: formatSessionTitleFallback(session.createdAt),
      })
      if (computedTitle) {
        await mergeSessionArtifacts(session.id, { title: computedTitle }).catch((err) => {
          notes.push(`Title update failed for ${session.id}: ${err instanceof Error ? err.message : 'unknown error'}`)
        })
        titlesUpdated += 1
      }
    }
  }

  const completedAt = new Date().toISOString()
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()

  return {
    ok: true,
    handle: normalizedHandle ?? null,
    processedSessions: sorted.length,
    digestEntries,
    skippedSessions,
    titlesUpdated,
    storageSessions: storedSessions.length,
    supabaseSessions: supabaseSessions.length,
    startedAt,
    completedAt,
    durationMs,
    notes,
  }
}
