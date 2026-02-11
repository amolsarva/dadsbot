"use client"
import { useCallback, useEffect, useState } from 'react'
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

type HistoryViewProps = {
  userHandle?: string
}

export function HistoryView({ userHandle }: HistoryViewProps) {
  const normalizedPropHandle = normalizeHandle(userHandle)
  const [rows, setRows] = useState<Row[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [activeHandle, setActiveHandle] = useState<string | undefined>(normalizedPropHandle)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())

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
      const sorted = [...serverRows].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime()
        const bTime = new Date(b.created_at).getTime()
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
        if (Number.isNaN(aTime)) return -1
        if (Number.isNaN(bTime)) return 1
        return bTime - aTime
      })
      setRows(sorted)
    } catch {
      setRows([])
    }
  }, [resolveHandle])

  useEffect(() => {
    loadHistory()
    loadProfile()
  }, [loadHistory, loadProfile])

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
              Complete a few interview sessions to start building your story profile.
              I&apos;ll remember details about your life, family, and experiences.
            </p>
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="panel-card">
        <h2 className="page-heading">Sessions</h2>
        {activeHandle && (
          <p className="page-subtext">
            Showing sessions saved for <span className="highlight">@{activeHandle}</span>
          </p>
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
                    <h3>{s.title || `Session from ${new Date(s.created_at).toLocaleString()}`}</h3>
                    <span className={`history-status history-status--${s.status}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="history-meta">
                    {new Date(s.created_at).toLocaleDateString()} • {s.total_turns} turns
                  </div>
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
    </main>
  )
}

export default HistoryView
