import { normalizeHandle } from '@/lib/user-scope'
import { deleteSession, listSessions, mergeSessionArtifacts } from '@/lib/data'
import {
  deleteStoredSessionArtifacts,
  fetchStoredSession,
  fetchStoredSessions,
  StoredSession,
} from '@/lib/history'
import { clearDigest, updateDigestAfterSession } from '@/lib/conversation-digest'
import { SummarizableTurn, generateSessionTitle } from '@/lib/session-title'
import { formatSessionTitleFallback } from '@/lib/fallback-texts'

const CLEANUP_MIN_AGE_MINUTES = 10
const CLEANUP_AGE_MS = CLEANUP_MIN_AGE_MINUTES * 60 * 1000

export type HistoryFixReport = {
  ok: boolean
  handle: string | null
  processedSessions: number
  digestEntries: number
  skippedSessions: number
  deletedSupabaseSessions: string[]
  deletedStorageSessions: string[]
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
  origin: 'supabase' | 'storage'
  handle: string | null
  title?: string | null
  turns: SummarizableTurn[]
}

function buildTurnsFromStored(session: StoredSession): SummarizableTurn[] {
  const turns: SummarizableTurn[] = []
  for (const turn of session.turns) {
    const transcript = typeof turn.transcript === 'string' ? turn.transcript.trim() : ''
    if (transcript) {
      turns.push({ role: 'user', text: transcript })
    }
    const assistantReply = typeof turn.assistantReply === 'string' ? turn.assistantReply.trim() : ''
    if (assistantReply) {
      turns.push({ role: 'assistant', text: assistantReply })
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
    const turns: SummarizableTurn[] = []
    for (const rawTurn of session.turns || []) {
      const text = typeof rawTurn.text === 'string' ? rawTurn.text.trim() : ''
      if (!text) continue
      turns.push({ role: rawTurn.role as 'user' | 'assistant', text })
    }
    combined.set(session.id, {
      id: session.id,
      createdAt: session.created_at,
      totalTurns: session.total_turns,
      durationMs: session.duration_ms ?? 0,
      status: session.status,
      origin: 'supabase',
      handle: session.user_handle ?? null,
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
      origin: 'storage',
      handle: stored.userHandle ?? null,
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
  const deletedSupabaseSessions: string[] = []
  const deletedStorageSessions: string[] = []

  for (const session of sorted) {
    let digestTurns = session.turns
      .map((turn) => {
        const text = typeof turn.text === 'string' ? turn.text.trim() : ''
        if (!text) return null
        return { role: turn.role, text }
      })
      .filter((turn): turn is { role: 'user' | 'assistant'; text: string } => Boolean(turn))

    if (!digestTurns.length) {
      try {
        const storedFallback = await fetchStoredSession(session.id)
        if (storedFallback) {
          const fallbackTurns = buildTurnsFromStored(storedFallback)
          if (fallbackTurns.length) {
            digestTurns = fallbackTurns
            if (!session.totalTurns) session.totalTurns = storedFallback.totalTurns
            if (!session.durationMs) session.durationMs = storedFallback.totalDurationMs
          }
        }
      } catch {
        // ignore
      }
    }

    const createdAtTime = new Date(session.createdAt).getTime()
    const isOld =
      Number.isFinite(createdAtTime) && !Number.isNaN(createdAtTime)
        ? createdAtTime < Date.now() - CLEANUP_AGE_MS
        : true
    const shouldDeleteEmpty = !digestTurns.length && session.status !== 'in_progress' && isOld

    if (shouldDeleteEmpty) {
      if (session.origin === 'supabase') {
        await deleteSession(session.id).catch((err) => {
          notes.push(`Failed to delete session ${session.id}: ${err instanceof Error ? err.message : 'unknown error'}`)
        })
        await deleteStoredSessionArtifacts(session.id).catch(() => undefined)
        deletedSupabaseSessions.push(session.id)
      } else {
        const deleted = await deleteStoredSessionArtifacts(session.id)
        if (deleted > 0) {
          deletedStorageSessions.push(session.id)
        } else {
          notes.push(`Stored cleanup skipped for ${session.id}; no blobs deleted.`)
        }
      }
      continue
    }

    if (!digestTurns.length) {
      skippedSessions += 1
      continue
    }

    try {
      await updateDigestAfterSession(normalizedHandle ?? null, session.id, digestTurns, {
        date: session.createdAt,
        turnCount: session.totalTurns || digestTurns.length,
        durationMs: session.durationMs,
      })
      digestEntries += 1
    } catch (err) {
      notes.push(`Digest update failed for ${session.id}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }

    if (!session.title) {
      const computedTitle = generateSessionTitle(digestTurns, {
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
    processedSessions: sorted.length - deletedSupabaseSessions.length - deletedStorageSessions.length,
    digestEntries,
    skippedSessions,
    deletedSupabaseSessions,
    deletedStorageSessions,
    titlesUpdated,
    storageSessions: storedSessions.length,
    supabaseSessions: supabaseSessions.length,
    startedAt,
    completedAt,
    durationMs,
    notes,
  }
}
