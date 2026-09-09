'use client'

import { useCallback, useEffect, useState } from 'react'

type ServiceStatus = 'checking' | 'ok' | 'error' | 'warning'

type ServiceState = {
  id: string
  label: string
  status: ServiceStatus
  detail: string
}

// Status must not be conveyed by colour alone, so each state carries a glyph
// and a text label for screen readers and colour-blind users.
const STATUS_META: Record<ServiceStatus, { glyph: string }> = {
  checking: { glyph: '…' },
  ok: { glyph: '✓' },
  warning: { glyph: '!' },
  error: { glyph: '×' },
}

type SetupCheck = {
  key: string
  label: string
  ready: boolean
  required: boolean
  missing: string[]
  hint: string
}

const SHORT_LABELS: Record<string, string> = {
  storage: 'Storage',
  model: 'Gemini',
  voice: 'Voice',
  email: 'Email',
}

/**
 * Reports configuration readiness from a single free endpoint.
 *
 * This deliberately does NOT call /api/diagnostics/google or
 * /api/diagnostics/openai: those issue real, billable model requests, and this
 * grid renders on the home page, so every visit was costing four paid
 * inferences. Live provider probes belong on /diagnostics, where an operator
 * asks for them on purpose.
 */
export function ServiceStatusGrid({ diagnosticsHref }: { diagnosticsHref: string }) {
  const [services, setServices] = useState<ServiceState[]>([])

  const check = useCallback(async () => {
    const unavailable: ServiceState[] = [
      { id: 'setup', label: 'Config', status: 'error', detail: 'status unavailable' },
    ]
    try {
      const res = await fetch('/api/setup-status', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      const checks: SetupCheck[] = Array.isArray(data?.checks) ? data.checks : []
      if (!checks.length) {
        setServices(unavailable)
        return
      }
      setServices(
        checks.map((entry) => ({
          id: entry.key,
          label: SHORT_LABELS[entry.key] || entry.label,
          status: entry.ready ? 'ok' : entry.required ? 'error' : 'warning',
          detail: entry.ready ? 'configured' : `missing ${entry.missing.join(', ')}`,
        })),
      )
    } catch {
      setServices(unavailable)
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  return (
    <div className="service-grid">
      <div className="service-grid__header">
        <span className="service-grid__title">Services</span>
        <a className="service-grid__link" href={diagnosticsHref}>Details</a>
      </div>
      <div className="service-grid__items">
        {services.map((s) => (
          <div key={s.id} className="service-grid__item" title={`${s.label}: ${s.detail}`}>
            <span className={`service-grid__dot service-grid__dot--${s.status}`} aria-hidden="true">
              {STATUS_META[s.status].glyph}
            </span>
            <span className="service-grid__label">{s.label}</span>
            <span className="sr-only">{s.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
