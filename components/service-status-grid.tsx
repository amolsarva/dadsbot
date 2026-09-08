'use client'

import { useCallback, useEffect, useState } from 'react'

type ServiceStatus = 'checking' | 'ok' | 'error' | 'warning'

type ServiceState = {
  id: string
  label: string
  status: ServiceStatus
}

// Status must not be conveyed by colour alone, so each state carries a glyph
// and a text label for screen readers and colour-blind users.
const STATUS_META: Record<ServiceStatus, { glyph: string; text: string }> = {
  checking: { glyph: '…', text: 'checking' },
  ok: { glyph: '✓', text: 'operational' },
  warning: { glyph: '!', text: 'degraded' },
  error: { glyph: '×', text: 'not working' },
}

const SERVICES: { id: string; label: string; endpoint: string }[] = [
  { id: 'health', label: 'System', endpoint: '/api/health' },
  { id: 'google', label: 'Gemini', endpoint: '/api/diagnostics/google' },
  { id: 'openai', label: 'OpenAI', endpoint: '/api/diagnostics/openai' },
  { id: 'storage', label: 'Storage', endpoint: '/api/diagnostics/storage' },
]

export function ServiceStatusGrid({ diagnosticsHref }: { diagnosticsHref: string }) {
  const [services, setServices] = useState<ServiceState[]>(
    SERVICES.map(s => ({ id: s.id, label: s.label, status: 'checking' })),
  )

  const checkAll = useCallback(async () => {
    const results = await Promise.allSettled(
      SERVICES.map(async (svc) => {
        try {
          const res = await fetch(svc.endpoint)
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.ok === false) return { id: svc.id, label: svc.label, status: 'error' as const }
          if (data.warning) return { id: svc.id, label: svc.label, status: 'warning' as const }
          return { id: svc.id, label: svc.label, status: 'ok' as const }
        } catch {
          return { id: svc.id, label: svc.label, status: 'error' as const }
        }
      }),
    )
    setServices(
      results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { id: SERVICES[i].id, label: SERVICES[i].label, status: 'error' as const },
      ),
    )
  }, [])

  useEffect(() => {
    checkAll()
  }, [checkAll])

  return (
    <div className="service-grid">
      <div className="service-grid__header">
        <span className="service-grid__title">Services</span>
        <a className="service-grid__link" href={diagnosticsHref}>Details</a>
      </div>
      <div className="service-grid__items">
        {services.map(s => {
          const meta = STATUS_META[s.status]
          return (
            <div key={s.id} className="service-grid__item" title={`${s.label}: ${meta.text}`}>
              <span className={`service-grid__dot service-grid__dot--${s.status}`} aria-hidden="true">
                {meta.glyph}
              </span>
              <span className="service-grid__label">{s.label}</span>
              <span className="sr-only">{meta.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
