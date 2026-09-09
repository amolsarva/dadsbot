'use client'

import { useEffect, useState } from 'react'

type SetupCheck = {
  key: string
  label: string
  ready: boolean
  required: boolean
  missing: string[]
  hint: string
}

type SetupStatusResponse = {
  ok?: boolean
  ready?: boolean
  checks?: SetupCheck[]
}

/**
 * Explains a failed start in terms of what is actually missing. Renders nothing
 * when every required service is configured, so it stays out of the way on a
 * healthy deployment.
 */
export function SetupStatus() {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/setup-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SetupStatusResponse | null) => {
        if (cancelled || !data || !Array.isArray(data.checks)) return
        setChecks(data.checks)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!checks) return null

  const blocking = checks.filter((check) => check.required && !check.ready)
  if (!blocking.length) return null

  return (
    <div className="setup-status" role="note">
      <div className="setup-status__title">Configuration needed</div>
      <p className="setup-status__lede">
        These environment variables are missing, so the interview cannot run:
      </p>
      <ul className="setup-status__list">
        {blocking.map((check) => (
          <li key={check.key}>
            <span className="setup-status__label">{check.label}</span>
            <code className="setup-status__vars">{check.missing.join(', ')}</code>
            <span className="setup-status__hint">{check.hint}</span>
          </li>
        ))}
      </ul>
      <p className="setup-status__footer">
        Set them in your hosting environment (Vercel → Settings → Environment
        Variables), then redeploy and reload this page.
      </p>
    </div>
  )
}
