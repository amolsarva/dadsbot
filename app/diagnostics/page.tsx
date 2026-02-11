'use client'

import { useCallback, useEffect, useState } from 'react'

type ServiceStatus = 'checking' | 'ok' | 'error' | 'warning'

type ServiceCheck = {
  id: string
  name: string
  status: ServiceStatus
  message: string
  detail?: string
  lastChecked: string | null
}

type LogEntry = {
  id: string
  time: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

const SERVICES: { id: string; name: string; endpoint: string }[] = [
  { id: 'health', name: 'System Health', endpoint: '/api/health' },
  { id: 'google', name: 'Google AI (Gemini)', endpoint: '/api/diagnostics/google' },
  { id: 'openai', name: 'OpenAI (TTS)', endpoint: '/api/diagnostics/openai' },
  { id: 'storage', name: 'Database & Storage', endpoint: '/api/diagnostics/storage' },
]

const TRANSCRIPT_STORAGE_KEY = 'diagnostics:lastTranscript'
const PROVIDER_ERROR_STORAGE_KEY = 'diagnostics:lastProviderError'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function DiagnosticsPage() {
  const [services, setServices] = useState<ServiceCheck[]>(
    SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      status: 'checking' as ServiceStatus,
      message: 'Checking...',
      lastChecked: null,
    }))
  )
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [lastError, setLastError] = useState<{ status: number; message: string; at: string } | null>(null)
  const [lastTranscript, setLastTranscript] = useState<{ text: string; turn: number; at: string } | null>(null)

  const addLog = useCallback((level: LogEntry['level'], source: string, message: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time: formatTime(new Date()),
      level,
      source,
      message,
    }
    setLogs((prev) => [...prev.slice(-100), entry])
  }, [])

  const checkService = useCallback(
    async (service: { id: string; name: string; endpoint: string }) => {
      addLog('info', service.id, `Checking ${service.name}...`)
      try {
        const res = await fetch(service.endpoint)
        const data = await res.json().catch(() => ({}))

        let status: ServiceStatus = 'ok'
        let message = 'Operational'
        let detail: string | undefined

        if (!res.ok || data.ok === false) {
          status = 'error'
          message = data.message || data.error || `HTTP ${res.status}`
          detail = data.detail || data.snippet
        } else if (data.warning) {
          status = 'warning'
          message = data.warning
        }

        // Extract useful info based on service type
        if (service.id === 'health' && data.ok) {
          const env = data.env || {}
          message = `OpenAI: ${env.hasOpenAI ? '✓' : '✗'} | Storage: ${env.storageProvider || 'none'} | Emails: ${env.emailsEnabled ? '✓' : '✗'}`
        } else if (service.id === 'google' && data.ok) {
          message = `Model: ${data.model?.name || data.model || 'gemini'}`
        } else if (service.id === 'openai' && data.ok) {
          message = `Model: ${data.model?.id || data.model || 'gpt-4'}`
        } else if (service.id === 'storage' && data.ok) {
          const env = data.env || {}
          message = `Provider: ${env.provider || 'supabase'} | Health: ${data.health?.ok ? '✓' : '✗'}`
        }

        addLog(status === 'ok' ? 'info' : status === 'warning' ? 'warn' : 'error', service.id, message)

        return {
          id: service.id,
          name: service.name,
          status,
          message,
          detail,
          lastChecked: new Date().toISOString(),
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Connection failed'
        addLog('error', service.id, errMsg)
        return {
          id: service.id,
          name: service.name,
          status: 'error' as ServiceStatus,
          message: errMsg,
          lastChecked: new Date().toISOString(),
        }
      }
    },
    [addLog]
  )

  const runAllChecks = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    addLog('info', 'system', 'Starting diagnostics...')

    const results: ServiceCheck[] = []
    for (const service of SERVICES) {
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, status: 'checking', message: 'Checking...' } : s))
      )
      const result = await checkService(service)
      results.push(result)
      setServices((prev) => prev.map((s) => (s.id === service.id ? result : s)))
    }

    const errors = results.filter((r) => r.status === 'error').length
    const warnings = results.filter((r) => r.status === 'warning').length

    if (errors === 0 && warnings === 0) {
      addLog('info', 'system', `All ${results.length} services operational ✓`)
    } else {
      addLog('warn', 'system', `Completed: ${errors} errors, ${warnings} warnings`)
    }

    setIsRunning(false)
  }, [isRunning, checkService, addLog])

  // Load saved error/transcript from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const rawError = window.localStorage.getItem(PROVIDER_ERROR_STORAGE_KEY)
      if (rawError) {
        const parsed = JSON.parse(rawError)
        if (parsed && typeof parsed === 'object') {
          setLastError({
            status: parsed.status || 0,
            message: parsed.message || 'Unknown error',
            at: parsed.at || '',
          })
        }
      }
    } catch {}

    try {
      const rawTranscript = window.localStorage.getItem(TRANSCRIPT_STORAGE_KEY)
      if (rawTranscript) {
        const parsed = JSON.parse(rawTranscript)
        if (parsed && typeof parsed === 'object') {
          setLastTranscript({
            text: parsed.text || '',
            turn: parsed.turn || 0,
            at: parsed.at || '',
          })
        }
      }
    } catch {}
  }, [])

  // Run checks on mount
  useEffect(() => {
    runAllChecks()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const statusColors: Record<ServiceStatus, string> = {
    checking: 'var(--muted)',
    ok: 'var(--accent-deep)',
    warning: '#f59e0b',
    error: '#ef4444',
  }

  const statusIcons: Record<ServiceStatus, string> = {
    checking: '⋯',
    ok: '✓',
    warning: '⚠',
    error: '✕',
  }

  return (
    <main>
      <div className="panel-card diagnostics-panel">
        <h2 className="page-heading">System Status</h2>

        <button
          onClick={runAllChecks}
          disabled={isRunning}
          className="btn-secondary btn-large"
          style={{ marginBottom: '24px' }}
        >
          {isRunning ? 'Checking...' : 'Run Diagnostics'}
        </button>

        {/* Service Status Grid */}
        <div className="service-status-grid">
          {services.map((service) => (
            <div
              key={service.id}
              className="service-card"
              style={{ borderLeftColor: statusColors[service.status] }}
            >
              <div className="service-header">
                <span
                  className="service-icon"
                  style={{ color: statusColors[service.status] }}
                >
                  {statusIcons[service.status]}
                </span>
                <span className="service-name">{service.name}</span>
              </div>
              <div className="service-message">{service.message}</div>
              {service.detail && (
                <div className="service-detail">{service.detail}</div>
              )}
              {service.lastChecked && (
                <div className="service-timestamp">
                  Last checked: {new Date(service.lastChecked).toLocaleTimeString()}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Recent Issues Section */}
        <div className="diagnostics-section">
          <h3>Recent Activity</h3>

          {lastTranscript && (
            <div className="recent-item">
              <div className="recent-label">Last Transcript (Turn {lastTranscript.turn})</div>
              <div className="recent-value">
                {lastTranscript.text ? `"${lastTranscript.text.slice(0, 100)}${lastTranscript.text.length > 100 ? '...' : ''}"` : 'No transcript captured'}
              </div>
              <div className="recent-timestamp">
                {lastTranscript.at ? new Date(lastTranscript.at).toLocaleString() : '—'}
              </div>
            </div>
          )}

          {lastError && (
            <div className="recent-item recent-item--error">
              <div className="recent-label">Last Error (HTTP {lastError.status})</div>
              <div className="recent-value">{lastError.message}</div>
              <div className="recent-timestamp">
                {lastError.at ? new Date(lastError.at).toLocaleString() : '—'}
              </div>
            </div>
          )}

          {!lastTranscript && !lastError && (
            <p className="status-note">No recent activity recorded.</p>
          )}
        </div>

        {/* Live Log */}
        <div className="diagnostics-section">
          <h3>Diagnostics Log</h3>
          <div className="log-container">
            {logs.length === 0 ? (
              <div className="log-empty">No log entries yet. Run diagnostics to see activity.</div>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className={`log-entry log-entry--${entry.level}`}>
                  <span className="log-time">{entry.time}</span>
                  <span className="log-source">[{entry.source}]</span>
                  <span className="log-message">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="diagnostics-section">
          <h3>Quick Links</h3>
          <div className="quick-links">
            <a href="/api/health" target="_blank" rel="noopener noreferrer" className="quick-link">
              Health API
            </a>
            <a href="/api/diagnostics/google" target="_blank" rel="noopener noreferrer" className="quick-link">
              Google API
            </a>
            <a href="/api/diagnostics/openai" target="_blank" rel="noopener noreferrer" className="quick-link">
              OpenAI API
            </a>
            <a href="/api/diagnostics/storage" target="_blank" rel="noopener noreferrer" className="quick-link">
              Storage API
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .service-status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .service-card {
          background: var(--bg-accent);
          border: 1px solid var(--border);
          border-left-width: 4px;
          border-radius: 8px;
          padding: 16px;
        }

        .service-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .service-icon {
          font-size: 18px;
          font-weight: bold;
        }

        .service-name {
          font-weight: 600;
          color: var(--ink);
        }

        .service-message {
          font-size: 13px;
          color: var(--ink);
          margin-bottom: 4px;
        }

        .service-detail {
          font-size: 12px;
          color: var(--muted);
          font-family: monospace;
          background: var(--bg);
          padding: 8px;
          border-radius: 4px;
          margin-top: 8px;
          overflow-x: auto;
        }

        .service-timestamp {
          font-size: 11px;
          color: var(--muted);
          margin-top: 8px;
        }

        .diagnostics-section {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }

        .diagnostics-section h3 {
          font-size: 16px;
          font-weight: 600;
          color: var(--ink);
          margin: 0 0 16px 0;
        }

        .recent-item {
          background: var(--bg-accent);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 12px;
        }

        .recent-item--error {
          border-left: 4px solid #ef4444;
        }

        .recent-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .recent-value {
          font-size: 14px;
          color: var(--ink);
        }

        .recent-timestamp {
          font-size: 11px;
          color: var(--muted);
          margin-top: 8px;
        }

        .log-container {
          background: #1a1a2e;
          border-radius: 8px;
          padding: 16px;
          max-height: 300px;
          overflow-y: auto;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 12px;
        }

        .log-empty {
          color: #666;
          font-style: italic;
        }

        .log-entry {
          padding: 4px 0;
          display: flex;
          gap: 8px;
        }

        .log-entry--info {
          color: #8be9fd;
        }

        .log-entry--warn {
          color: #f1fa8c;
        }

        .log-entry--error {
          color: #ff5555;
        }

        .log-time {
          color: #6272a4;
          flex-shrink: 0;
        }

        .log-source {
          color: #bd93f9;
          flex-shrink: 0;
        }

        .log-message {
          flex: 1;
        }

        .quick-links {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .quick-link {
          padding: 8px 16px;
          background: var(--bg-accent);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--ink);
          text-decoration: none;
          font-size: 13px;
          transition: border-color 0.2s, background 0.2s;
        }

        .quick-link:hover {
          border-color: var(--accent);
          background: var(--bg);
        }

        .status-note {
          color: var(--muted);
          font-size: 14px;
          font-style: italic;
        }
      `}</style>
    </main>
  )
}
