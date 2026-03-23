"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACTIVE_USER_HANDLE_STORAGE_KEY,
  normalizeHandle,
} from '@/lib/user-scope'

type ProfileSection = {
  title: string
  highlights: string[]
  archived: string[]
}

type UserProfile = {
  raw: string
  sections: ProfileSection[]
  updatedAt: string | null
}

type Row = {
  id: string
  created_at: string
  title: string | null
  status: string
  total_turns: number
  duration_ms?: number
  summary?: string
  topic_tags?: string[]
  key_facts?: string[]

  artifacts: {
    transcript_txt?: string | null
    transcript_json?: string | null
    session_manifest?: string | null
    session_audio?: string | null
  }

  manifestUrl?: string | null
  firstAudioUrl?: string | null
  sessionAudioUrl?: string | null
}

type FixerReport = {
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

type MetricsSnapshot = {
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

type MetricsResponse = {
  ok: boolean
  handle: string | null
  generatedAt: string
  scoped: MetricsSnapshot
  global: MetricsSnapshot
  scopedLimitHit: boolean
  blobCount: number
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const precision = value >= 10 || unit === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unit]}`
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return ''
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

type HistoryViewProps = {
  userHandle?: string
  onSessionsLoaded?: (mostRecentSessionId: string | null) => void
}

export function HistoryView({ userHandle, onSessionsLoaded }: HistoryViewProps) {
  const normalizedPropHandle = normalizeHandle(userHandle)
  const [rows, setRows] = useState<Row[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [activeHandle, setActiveHandle] = useState<string | undefined>(normalizedPropHandle)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [fixerStatus, setFixerStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [fixerReport, setFixerReport] = useState<FixerReport | null>(null)
  const [fixerError, setFixerError] = useState<string | null>(null)
  const maintenanceRanRef = useRef(false)

  const resolveHandle = useCallback(() => {
    if (normalizedPropHandle) return normalizedPropHandle
    if (typeof window === 'undefined') return undefined
    try {
      return normalizeHandle(window.localStorage.getItem(ACTIVE_USER_HANDLE_STORAGE_KEY))
    } catch {
      return undefined
    }
  }, [normalizedPropHandle])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (normalizedPropHandle) {
      window.localStorage.setItem(ACTIVE_USER_HANDLE_STORAGE_KEY, normalizedPropHandle)
      setActiveHandle(normalizedPropHandle)
    } else {
      setActiveHandle(resolveHandle())
    }
  }, [normalizedPropHandle, resolveHandle])

  const loadProfile = useCallback(async () => {
    setProfileLoading(true)
    try {
      const handle = resolveHandle()
      const query = handle ? `?handle=${encodeURIComponent(handle)}` : ''
      const res = await fetch(`/api/user-profile${query}`)
      const data = await res.json()
      if (data.ok && data.hasProfile && data.profile) {
        setProfile(data.profile)
      } else {
        setProfile(null)
      }
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [resolveHandle])

  const loadHistory = useCallback(async () => {
    try {
      const handle = resolveHandle()
      setActiveHandle(handle)
      const query = handle ? `?handle=${encodeURIComponent(handle)}` : ''
      const api = await (await fetch(`/api/history${query}`)).json()
      const serverRows: Row[] = api?.items || []
      // Filter out stale sessions (in_progress with 0 turns = abandoned)
      const meaningful = serverRows.filter(
        (r) => !(r.status === 'in_progress' && r.total_turns === 0)
      )
      const sorted = [...meaningful].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime()
        const bTime = new Date(b.created_at).getTime()
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
        if (Number.isNaN(aTime)) return -1
        if (Number.isNaN(bTime)) return 1
        return bTime - aTime
      })
      setRows(sorted)
      // Call callback with the most recent session ID if available
      onSessionsLoaded?.(sorted.length > 0 ? sorted[0].id : null)
    } catch {
      setRows([])
      onSessionsLoaded?.(null)
    }
  }, [resolveHandle, onSessionsLoaded])

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true)
    setMetricsError(null)
    try {
      const handle = resolveHandle()
      const query = handle ? `?handle=${encodeURIComponent(handle)}` : ''
      const resp = await fetch(`/api/history/metrics${query}`)
      const data = await resp.json().catch(() => null)
      if (resp.ok && data && data.ok !== false) {
        setMetrics(data as MetricsResponse)
      } else {
        throw new Error(data?.error || 'Failed to load metrics')
      }
    } catch (err) {
      setMetrics(null)
      setMetricsError(err instanceof Error ? err.message : 'Failed to load metrics')
    } finally {
      setMetricsLoading(false)
    }
  }, [resolveHandle])

  useEffect(() => {
    loadHistory()
    loadProfile()
    loadMetrics()
  }, [loadHistory, loadProfile, loadMetrics])

  // Run maintenance once on mount: re-summarize sessions with missing AI digests
  useEffect(() => {
    if (maintenanceRanRef.current) return
    maintenanceRanRef.current = true

    const handle = resolveHandle()
    setMaintenanceRunning(true)

    fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: handle || null }),
    })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        // If any sessions were digested or titled, reload history to show updated data
        if (data && (data.digested?.length > 0 || data.titled?.length > 0)) {
          await loadHistory()
          await loadProfile()
        }
      })
      .catch(() => {})
      .finally(() => setMaintenanceRunning(false))
  }, [resolveHandle, loadHistory, loadProfile])

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id)
      try {
        const resp = await fetch(`/api/history/${id}`, { method: 'DELETE' })
        if (resp.ok) {
          await loadHistory()
          await loadProfile() // Refresh profile after deletion
        }
      } finally {
        setDeletingId(null)
      }
    },
    [loadHistory, loadProfile],
  )

  const handleClearAll = useCallback(async () => {
    setClearingAll(true)
    try {
      const handle = resolveHandle()
      const query = handle ? `?handle=${encodeURIComponent(handle)}` : ''
      const resp = await fetch(`/api/history${query}`, { method: 'DELETE' })
      if (resp.ok) {
        setRows([])
        setProfile(null)
      }
    } finally {
      setClearingAll(false)
    }
  }, [resolveHandle])

  const runFixer = useCallback(async () => {
    setFixerStatus('running')
    setFixerError(null)
    try {
      const handle = resolveHandle()
      const resp = await fetch('/api/history/fixer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle: handle ?? null }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok || !data || data.ok === false) {
        throw new Error(data?.error || 'Unable to repair history')
      }
      setFixerReport(data as FixerReport)
      setFixerStatus('success')
      await loadHistory()
      await loadProfile()
      await loadMetrics()
    } catch (err) {
      setFixerStatus('error')
      setFixerError(err instanceof Error ? err.message : 'Failed to repair history')
    }
  }, [resolveHandle, loadHistory, loadProfile, loadMetrics])

  const scopedSessionLink = useCallback(
    (id: string) => {
      const handle = activeHandle
      return handle ? `/u/${handle}/session/${id}` : `/session/${id}`
    },
    [activeHandle],
  )

  const toggleSession = useCallback((id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const totalTurns = rows.reduce((sum, r) => sum + r.total_turns, 0)
  const completedSessions = rows.filter(r => r.status === 'completed' || r.status === 'emailed').length

  return (
    <main className="history-page">
      {/* User Profile/Dossier Section */}
      <div className="panel-card profile-card">
        <h2 className="page-heading">
          {activeHandle ? `What we know about @${activeHandle}` : 'Your Story Profile'}
        </h2>

        {profileLoading ? (
          <div className="profile-loading">Loading profile...</div>
        ) : profile && profile.sections.length > 0 ? (
          <div className="profile-content">
            <div className="profile-stats">
              <div className="stat">
                <span className="stat-value">{rows.length}</span>
                <span className="stat-label">Sessions</span>
              </div>
              <div className="stat">
                <span className="stat-value">{completedSessions}</span>
                <span className="stat-label">Completed</span>
              </div>
              <div className="stat">
                <span className="stat-value">{totalTurns}</span>
                <span className="stat-label">Total Turns</span>
              </div>
            </div>

            <div className="profile-sections">
              {profile.sections.map((section, idx) => (
                <div key={idx} className="profile-section">
                  <h3 className="profile-section-title">{section.title}</h3>
                  {section.highlights.length > 0 && (
                    <ul className="profile-highlights">
                      {section.highlights.map((item, i) => (
                        <li key={i} className="profile-highlight">{item}</li>
                      ))}
                    </ul>
                  )}
                  {section.archived.length > 0 && (
                    <details className="profile-archived">
                      <summary>Earlier memories ({section.archived.length})</summary>
                      <ul>
                        {section.archived.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>

            {profile.updatedAt && (
              <div className="profile-updated">
                Last updated: {new Date(profile.updatedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        ) : (
          <div className="profile-empty">
            <p>No profile built yet.</p>
            <p className="profile-empty-hint">
              {rows.length > 0
                ? `You have ${rows.length} session${rows.length !== 1 ? 's' : ''} recorded. Complete a full interview so I can start building your story profile.`
                : 'Complete a few interview sessions to start building your story profile. I\u2019ll remember details about your life, family, and experiences.'}
            </p>
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="panel-card history-fixer-card">
        <div className="history-fixer-header">
          <h2 className="page-heading">History Fixer</h2>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={runFixer}
            disabled={fixerStatus === 'running'}
          >
            {fixerStatus === 'running' ? 'Repairing…' : 'Run fixer'}
          </button>
        </div>
        <p className="page-subtext">
          Re-scan stored sessions and rebuild summaries for{' '}
          <span className="highlight">{activeHandle ? `@${activeHandle}` : 'unassigned recordings'}</span>.
        </p>
        {fixerStatus === 'running' && (
          <p className="history-fixer-status">Analyzing transcripts and rewriting summaries…</p>
        )}
        {fixerError && <p className="history-fixer-error">{fixerError}</p>}
        {fixerReport && (
          <div className="history-fixer-report">
            <div>
              <span className="history-fixer-label">Sessions scanned</span>
              <span className="history-fixer-value">{fixerReport.processedSessions}</span>
            </div>
            <div>
              <span className="history-fixer-label">Summaries refreshed</span>
              <span className="history-fixer-value">{fixerReport.digestEntries}</span>
            </div>
            <div>
              <span className="history-fixer-label">Titles updated</span>
              <span className="history-fixer-value">{fixerReport.titlesUpdated}</span>
            </div>
            <div>
              <span className="history-fixer-label">Skipped (no text)</span>
              <span className="history-fixer-value">{fixerReport.skippedSessions}</span>
            </div>
          </div>
        )}
        {fixerReport?.notes?.length ? (
          <ul className="history-fixer-notes">
            {fixerReport.notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="panel-card">
        <h2 className="page-heading">Sessions</h2>
        {activeHandle && (
          <p className="page-subtext">
            Showing sessions saved for <span className="highlight">@{activeHandle}</span>
          </p>
        )}
        {maintenanceRunning && (
          <p className="page-subtext" style={{ opacity: 0.6 }}>Analyzing sessions...</p>
        )}
        {rows.length === 0 ? (
          <div className="history-empty">
            <p className="font-medium">No interviews yet.</p>
            <p className="mt-1">
              Run a session from the home page. Your completed
              interviews will appear here once they are saved.
            </p>
          </div>
        ) : (
          <ul className="history-list">
            {rows.map((s) => (
              <li key={s.id} className="history-item">
                <div
                  className="history-item-header"
                  onClick={() => toggleSession(s.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="history-item-title-row">
                    <span className="history-expand-icon">
                      {expandedSessions.has(s.id) ? '▼' : '▶'}
                    </span>
                    <h3>{s.title || s.summary || new Date(s.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</h3>
                    <span className={`history-status history-status--${s.status.replace('_', '-')}`}>
                      {s.status === 'in_progress' ? 'In Progress' : s.status === 'completed' ? 'Complete' : s.status}
                    </span>
                  </div>
                  {s.summary ? (
                    <p className="history-summary">{s.summary}</p>
                  ) : null}
                  {s.key_facts && s.key_facts.length > 0 ? (
                    <ul className="history-key-facts">
                      {s.key_facts.slice(0, 4).map((fact, i) => (
                        <li key={i} className="history-key-fact">{fact}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="history-meta">
                    <span className="history-date">
                      {new Date(s.created_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {s.duration_ms && s.duration_ms > 0 ? (
                      <>
                        <span className="history-separator">&middot;</span>
                        <span className="history-duration">{formatDuration(s.duration_ms)}</span>
                      </>
                    ) : null}
                    <span className="history-separator">&middot;</span>
                    <span className="history-turns">
                      {s.total_turns} {s.total_turns === 1 ? 'turn' : 'turns'}
                    </span>
                    {s.artifacts?.session_audio ? (
                      <>
                        <span className="history-separator">&middot;</span>
                        <span className="history-has-audio">🎙️ Audio</span>
                      </>
                    ) : null}
                    {s.artifacts?.transcript_txt ? (
                      <>
                        <span className="history-separator">&middot;</span>
                        <span className="history-has-transcript">📄 Transcript</span>
                      </>
                    ) : null}
                  </div>
                  {s.topic_tags && s.topic_tags.length > 0 ? (
                    <div className="history-tags">
                      {s.topic_tags.map(tag => (
                        <span key={tag} className="history-tag">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {expandedSessions.has(s.id) && (
                  <div className="history-item-body">
                    {(s.sessionAudioUrl || s.artifacts?.session_audio) && (
                      <div className="history-audio">
                        <label>Session Recording:</label>
                        <audio
                          controls
                          src={(s.sessionAudioUrl || s.artifacts?.session_audio) ?? undefined}
                        >
                          <track kind="captions" />
                        </audio>
                      </div>
                    )}

                    <div className="history-actions">
                      <a className="btn-secondary btn-small" href={scopedSessionLink(s.id)}>
                        View Full Session
                      </a>
                      {s.artifacts?.transcript_txt && (
                        <a className="link-button" href={s.artifacts.transcript_txt} target="_blank" rel="noreferrer">
                          📄 Transcript
                        </a>
                      )}
                      {s.manifestUrl && (
                        <a className="link-button" href={s.manifestUrl} target="_blank" rel="noreferrer">
                          📋 Manifest
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(s.id)
                        }}
                        disabled={deletingId === s.id || clearingAll}
                        className="link-button link-danger"
                        aria-label="Delete session"
                      >
                        {deletingId === s.id ? 'Deleting…' : '🗑 Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="history-footer">
          <button
            type="button"
            onClick={handleClearAll}
            className="link-button link-danger"
            disabled={clearingAll || rows.length === 0}
          >
            {clearingAll ? 'Clearing…' : 'Clear all history'}
          </button>
        </div>
      </div>

      <div className="panel-card history-metrics-card">
        <h2 className="page-heading">Database Metrics</h2>
        {metricsLoading ? (
          <p className="history-metrics-status">Gathering storage stats…</p>
        ) : metrics ? (
          <div className="history-metrics-grid">
            <div className="history-metrics-panel">
              <h3>{activeHandle ? `@${activeHandle}` : 'Unassigned handle'}</h3>
              <ul className="history-metrics-list">
                <li>
                  <span>Sessions</span>
                  <strong>{metrics.scoped.sessionCount}</strong>
                </li>
                <li>
                  <span>Files stored</span>
                  <strong>{metrics.scoped.fileCount}</strong>
                </li>
                <li>
                  <span>Storage used</span>
                  <strong>{formatBytes(metrics.scoped.storageBytes)}</strong>
                </li>
                <li>
                  <span>Audio clips</span>
                  <strong>{metrics.scoped.audioFileCount}</strong>
                </li>
                <li>
                  <span>Transcripts</span>
                  <strong>{metrics.scoped.transcriptFileCount}</strong>
                </li>
                <li>
                  <span>Total turns</span>
                  <strong>{metrics.scoped.totalTurns ?? 0}</strong>
                </li>
                <li>
                  <span>Talk time</span>
                  <strong>{formatDuration(metrics.scoped.totalDurationMs || 0) || '—'}</strong>
                </li>
                <li>
                  <span>Last session</span>
                  <strong>{formatTimestamp(metrics.scoped.lastSessionAt)}</strong>
                </li>
              </ul>
            </div>
            <div className="history-metrics-panel">
              <h3>Whole app</h3>
              <ul className="history-metrics-list">
                <li>
                  <span>Sessions indexed</span>
                  <strong>{metrics.global.sessionCount}</strong>
                </li>
                <li>
                  <span>Files saved</span>
                  <strong>{metrics.global.fileCount}</strong>
                </li>
                <li>
                  <span>Total storage</span>
                  <strong>{formatBytes(metrics.global.storageBytes)}</strong>
                </li>
                <li>
                  <span>Audio files</span>
                  <strong>{metrics.global.audioFileCount}</strong>
                </li>
                <li>
                  <span>Transcripts</span>
                  <strong>{metrics.global.transcriptFileCount}</strong>
                </li>
                <li>
                  <span>Manifests</span>
                  <strong>{metrics.global.manifestFileCount}</strong>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <p className="history-metrics-error">{metricsError || 'Metrics unavailable.'}</p>
        )}
        {metrics?.scopedLimitHit && (
          <p className="history-metrics-note">
            Showing the latest 500 sessions for this handle. Run the fixer to refresh older data.
          </p>
        )}
      </div>
    </main>
  )
}

export default HistoryView
