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

const CLEANUP_MIN_AGE_MINUTES = 60 * 24
const CLEANUP_AGE_MS = CLEANUP_MIN_AGE_MINUTES * 60 * 1000

export type HistoryFixReport = {
  ok: boolean
  handle: string | null
  processedSessions: number
  digestEntries: number
  skippedSessions: number
  statusRepairs: number
  metadataRepairs: number
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
  stored?: StoredSession
}

function hasMeaningfulUserTurn(turns: SummarizableTurn[]): boolean {
  return turns.some((turn) => turn.role === 'user' && typeof turn.text === 'string' && turn.text.trim().length > 0)
}

function shouldAdoptStoredTurns(existing: SummarizableTurn[], incoming: SummarizableTurn[]): boolean {
  if (!incoming.length) return false
  if (!existing.length) return true
  const existingHasUser = hasMeaningfulUserTurn(existing)
  const incomingHasUser = hasMeaningfulUserTurn(incoming)
  if (!existingHasUser && incomingHasUser) return true
  if (!existingHasUser && !incomingHasUser) {
    return incoming.length > existing.length
  }
  return false
}

function buildArtifactPatchFromStored(stored?: StoredSession | null): Record<string, string> {
  if (!stored) return {}
  const artifacts = stored.artifacts || {}
  const entries: Array<[string, string | null | undefined]> = [
    ['session_manifest', artifacts.session_manifest || artifacts.manifest || stored.manifestUrl],
    ['session_audio', artifacts.session_audio],
    ['transcript_txt', artifacts.transcript_txt],
    ['transcript_json', artifacts.transcript_json],
  ]
  const patch: Record<string, string> = {}
  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.trim().length > 0) {
      patch[key] = value.trim()
    }
  }
  return patch
}

function buildTurnsFromStored(session: StoredSession): Array<{ role: 'user' | 'assistant'; text: string }> {
  const turns: Array<{ role: 'user' | 'assistant'; text: string }> = []
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
      stored: undefined,
    })
  }

  for (const stored of storedSessions) {
    const turns = buildTurnsFromStored(stored)
    const createdAt = stored.startedAt || stored.endedAt || new Date().toISOString()
    const totalTurns = stored.totalTurns || Math.ceil(turns.length / 2)
    const durationMs = stored.totalDurationMs || 0
    const existing = combined.get(stored.sessionId)
    if (existing) {
      existing.stored = stored
      if (shouldAdoptStoredTurns(existing.turns, turns)) {
        existing.turns = turns
      }
      if (!existing.title && turns.length) {
        const computedTitle = generateSessionTitle(turns, {
          fallback: formatSessionTitleFallback(createdAt),
        })
        existing.title = computedTitle
      }
      if (totalTurns && (!existing.totalTurns || existing.totalTurns < totalTurns)) {
        existing.totalTurns = totalTurns
      }
      if (durationMs && (!existing.durationMs || existing.durationMs < durationMs)) {
        existing.durationMs = durationMs
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
      stored,
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
  let statusRepairs = 0
  let metadataRepairs = 0
  const deletedSupabaseSessions: string[] = []
  const deletedStorageSessions: string[] = []

  for (const session of sorted) {
    let digestTurns: Array<{ role: 'user' | 'assistant'; text: string }> = session.turns
      .map((turn) => {
        const text = typeof turn.text === 'string' ? turn.text.trim() : ''
        if (!text) return null
        return { role: turn.role, text }
      })
      .filter((turn): turn is { role: 'user' | 'assistant'; text: string } => turn !== null)

    let hasUserTurns = hasMeaningfulUserTurn(digestTurns)
    if (!digestTurns.length || !hasUserTurns) {
      let storedFallback = session.stored
      if (!storedFallback) {
        try {
          storedFallback = await fetchStoredSession(session.id)
          if (storedFallback) {
            session.stored = storedFallback
          }
        } catch {
          storedFallback = undefined
        }
      }
      if (storedFallback) {
        const fallbackTurns = buildTurnsFromStored(storedFallback)
        if (fallbackTurns.length) {
          digestTurns = fallbackTurns
          hasUserTurns = hasMeaningfulUserTurn(fallbackTurns)
          const storedTurns = storedFallback.totalTurns
          const storedDuration = storedFallback.totalDurationMs
          if (storedTurns && (!session.totalTurns || storedTurns > session.totalTurns)) {
            session.totalTurns = storedTurns
          }
          if (storedDuration && (!session.durationMs || storedDuration > session.durationMs)) {
            session.durationMs = storedDuration
          }
        }
      }
    }

    const createdAtTime = new Date(session.createdAt).getTime()
    const isOld =
      Number.isFinite(createdAtTime) && !Number.isNaN(createdAtTime)
        ? createdAtTime < Date.now() - CLEANUP_AGE_MS
        : true
    const staleInProgress = session.status === 'in_progress' && isOld
    const shouldDeleteEmpty =
      !hasUserTurns && (session.status !== 'in_progress' || staleInProgress)
    const shouldDeleteStaleInProgress =
      staleInProgress && (session.totalTurns <= 1 || !hasUserTurns)

    if (shouldDeleteEmpty || shouldDeleteStaleInProgress) {
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

    if (!hasUserTurns) {
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

    if (session.origin === 'supabase' && session.stored) {
      const patch: {
        status?: 'error' | 'in_progress' | 'completed' | 'emailed'
        totalTurns?: number
        durationMs?: number
        artifacts?: Record<string, string>
      } = {}
      let patchedStatus = false
      let patchedMetadata = false
      const stored = session.stored
      if (session.status === 'in_progress' && hasUserTurns) {
        patch.status = 'completed'
        patchedStatus = true
      }
      if (stored.totalTurns && stored.totalTurns > 0 && stored.totalTurns !== session.totalTurns) {
        patch.totalTurns = stored.totalTurns
        patchedMetadata = true
      }
      if (
        stored.totalDurationMs &&
        stored.totalDurationMs > 0 &&
        (!session.durationMs || stored.totalDurationMs !== session.durationMs)
      ) {
        patch.durationMs = stored.totalDurationMs
        patchedMetadata = true
      }
      const artifactPatch = buildArtifactPatchFromStored(stored)
      if (Object.keys(artifactPatch).length > 0) {
        patch.artifacts = artifactPatch
        patchedMetadata = true
      }
      if (patchedStatus || patchedMetadata) {
        try {
          await mergeSessionArtifacts(session.id, patch)
          if (patchedStatus) statusRepairs += 1
          if (patchedMetadata) metadataRepairs += 1
        } catch (err) {
          notes.push(`Metadata update failed for ${session.id}: ${err instanceof Error ? err.message : 'unknown error'}`)
        }
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
    statusRepairs,
    metadataRepairs,
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
