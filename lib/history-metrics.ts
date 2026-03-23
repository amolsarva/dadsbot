import { listBlobs } from '@/lib/blob'
import { fetchStoredSessions } from '@/lib/history'
import { normalizeHandle } from '@/lib/user-scope'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm']

export type MetricsSnapshot = {
  sessionCount: number
  fileCount: number
  storageBytes: number
  audioFileCount: number
  transcriptFileCount: number
  manifestFileCount: number
  totalDurationMs?: number
  totalTurns?: number
  lastSessionAt?: string | null
}

export type HistoryMetrics = {
  ok: boolean
  handle: string | null
  generatedAt: string
  scoped: MetricsSnapshot
  global: MetricsSnapshot
  scopedLimitHit: boolean
  blobCount: number
}

type SessionFileStats = {
  fileCount: number
  storageBytes: number
  audioFiles: number
  transcriptFiles: number
  manifestFiles: number
}

function classifyStatsForPath(pathname: string): Pick<SessionFileStats, 'audioFiles' | 'transcriptFiles' | 'manifestFiles'> {
  const lower = pathname.toLowerCase()
  const ext = lower.split('.').pop() || ''
  return {
    audioFiles: AUDIO_EXTENSIONS.includes(ext) ? 1 : 0,
    transcriptFiles: lower.includes('transcript') ? 1 : 0,
    manifestFiles: lower.includes('session-') && lower.endsWith('.json') ? 1 : 0,
  }
}

function sumStats(target: SessionFileStats, delta: SessionFileStats) {
  target.fileCount += delta.fileCount
  target.storageBytes += delta.storageBytes
  target.audioFiles += delta.audioFiles
  target.transcriptFiles += delta.transcriptFiles
  target.manifestFiles += delta.manifestFiles
}

function emptyStats(): SessionFileStats {
  return { fileCount: 0, storageBytes: 0, audioFiles: 0, transcriptFiles: 0, manifestFiles: 0 }
}

export async function getHistoryMetrics(options: { handle?: string | null } = {}): Promise<HistoryMetrics> {
  const normalizedHandle = normalizeHandle(options.handle ?? undefined)
  const { blobs } = await listBlobs({ prefix: 'sessions/', limit: 4000 })
  const perSession = new Map<string, SessionFileStats>()

  for (const blob of blobs) {
    const match = blob.pathname.match(/^sessions\/([^/]+)\//)
    if (!match) continue
    const sessionId = match[1]
    const stats = perSession.get(sessionId) || emptyStats()
    const classified = classifyStatsForPath(blob.pathname)
    stats.fileCount += 1
    stats.storageBytes += blob.size ?? 0
    stats.audioFiles += classified.audioFiles
    stats.transcriptFiles += classified.transcriptFiles
    stats.manifestFiles += classified.manifestFiles
    perSession.set(sessionId, stats)
  }

  const globalStats = emptyStats()
  for (const stats of perSession.values()) {
    sumStats(globalStats, stats)
  }
  const globalSnapshot: MetricsSnapshot = {
    sessionCount: perSession.size,
    fileCount: globalStats.fileCount,
    storageBytes: globalStats.storageBytes,
    audioFileCount: globalStats.audioFiles,
    transcriptFileCount: globalStats.transcriptFiles,
    manifestFileCount: globalStats.manifestFiles,
  }

  const scopedSessionsResult = await fetchStoredSessions({ handle: normalizedHandle ?? null, limit: 500 })
  const scopedStats = emptyStats()
  const scopedSessionIds = new Set(scopedSessionsResult.items.map((item) => item.sessionId))
  for (const sessionId of scopedSessionIds) {
    const stats = perSession.get(sessionId)
    if (stats) {
      sumStats(scopedStats, stats)
    }
  }

  const scopedSnapshot: MetricsSnapshot = {
    sessionCount: scopedSessionIds.size,
    fileCount: scopedStats.fileCount,
    storageBytes: scopedStats.storageBytes,
    audioFileCount: scopedStats.audioFiles,
    transcriptFileCount: scopedStats.transcriptFiles,
    manifestFileCount: scopedStats.manifestFiles,
    totalDurationMs: scopedSessionsResult.items.reduce((sum, session) => sum + (session.totalDurationMs || 0), 0),
    totalTurns: scopedSessionsResult.items.reduce((sum, session) => sum + (session.totalTurns || 0), 0),
    lastSessionAt: scopedSessionsResult.items.reduce<string | null>((latest, session) => {
      const candidate = session.endedAt || session.startedAt
      if (!candidate) return latest
      if (!latest || candidate > latest) return candidate
      return latest
    }, null),
  }

  return {
    ok: true,
    handle: normalizedHandle ?? null,
    generatedAt: new Date().toISOString(),
    scoped: scopedSnapshot,
    global: globalSnapshot,
    scopedLimitHit: scopedSessionsResult.items.length >= 500,
    blobCount: blobs.length,
  }
}
